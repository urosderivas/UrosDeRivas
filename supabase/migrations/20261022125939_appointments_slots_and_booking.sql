-- Huecos libres de un calendario entre dos fechas (de Madrid), para la página de reservas.
-- Respeta horario, duración, antelación mínima, días vista, bloqueos y citas ya reservadas,
-- sin decir de quién son.
create or replace function public.get_available_slots(p_provider_id uuid, p_from date, p_to date)
returns table (starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select * from public.appointment_providers
    where id = p_provider_id and active
  ),
  today as (select (now() at time zone 'Europe/Madrid')::date as d),
  days as (
    select g::date as day
    from p, today,
      generate_series(
        greatest(p_from, today.d),
        least(p_to, today.d + p.max_days_ahead, greatest(p_from, today.d) + 62),
        interval '1 day'
      ) g
  ),
  ranges as (
    select days.day, (r->>0)::time as t0,
      case when r->>1 = '24:00' then interval '24 hours' else (r->>1)::time - time '00:00' end as t1
    from days, p,
      jsonb_array_elements(coalesce(p.weekly_hours -> extract(isodow from days.day)::int::text, '[]'::jsonb)) r
  ),
  slots as (
    select ((ranges.day + ranges.t0 + n * make_interval(mins => p.duration_minutes)) at time zone 'Europe/Madrid') as s,
      p.duration_minutes, p.min_notice_hours
    from ranges, p,
      generate_series(0, floor(extract(epoch from (ranges.t1 - (ranges.t0 - time '00:00'))) / 60 / p.duration_minutes)::int - 1) n
  )
  select slots.s
  from slots
  where slots.s >= now() + make_interval(hours => slots.min_notice_hours)
    and not exists (
      select 1 from public.appointments a
      where a.provider_id = p_provider_id and a.status <> 'cancelled'
        and a.starts_at < slots.s + make_interval(mins => slots.duration_minutes) and a.ends_at > slots.s
    )
    and not exists (
      select 1 from public.appointment_blocks b
      where b.provider_id = p_provider_id
        and b.starts_at < slots.s + make_interval(mins => slots.duration_minutes) and b.ends_at > slots.s
    )
  order by slots.s;
$$;

grant execute on function public.get_available_slots(uuid, date, date) to anon, authenticated;

-- Reservar una cita. Un usuario solo puede coger un hueco libre (y tener 3 citas
-- futuras por calendario como mucho); el fisio o un admin pueden apuntar una cita a
-- cualquier hora que no choque con otra.
create or replace function public.book_appointment(
  p_provider_id uuid, p_starts_at timestamptz, p_patient_name text, p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_provider public.appointment_providers;
  v_staff boolean;
  v_ends timestamptz;
  v_name text := btrim(coalesce(p_patient_name, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'Inicia sesión para reservar una cita.'; end if;

  -- Bloquea el calendario mientras se reserva: dos personas no pueden coger el mismo hueco
  select * into v_provider from public.appointment_providers where id = p_provider_id for update;
  if not found then raise exception 'Este calendario no existe.'; end if;
  v_staff := public.is_provider_staff(p_provider_id);
  if not v_provider.active and not v_staff then raise exception 'Este calendario no admite reservas ahora mismo.'; end if;

  if length(v_name) not between 1 and 100 then raise exception 'Pon el nombre de quien va a la cita (máximo 100 caracteres).'; end if;
  if v_notes is not null and length(v_notes) > 500 then raise exception 'La nota puede tener como mucho 500 caracteres.'; end if;
  if p_starts_at is null then raise exception 'Elige una hora.'; end if;
  v_ends := p_starts_at + make_interval(mins => v_provider.duration_minutes);

  if v_staff then
    if exists (
      select 1 from public.appointments a
      where a.provider_id = p_provider_id and a.status <> 'cancelled'
        and a.starts_at < v_ends and a.ends_at > p_starts_at
    ) then
      raise exception 'Ya hay una cita a esa hora.';
    end if;
  else
    if not exists (
      select 1 from public.get_available_slots(
        p_provider_id,
        (p_starts_at at time zone 'Europe/Madrid')::date,
        (p_starts_at at time zone 'Europe/Madrid')::date
      ) s where s.starts_at = p_starts_at
    ) then
      raise exception 'Esa hora ya no está libre. Elige otra.';
    end if;
    if (
      select count(*) from public.appointments a
      where a.provider_id = p_provider_id and a.user_id = v_uid
        and a.status = 'booked' and a.starts_at > now()
    ) >= 3 then
      raise exception 'Ya tienes 3 citas pendientes en este calendario. Cancela alguna o espera a que pasen.';
    end if;
  end if;

  -- Las que apunta el fisio no son de ningún usuario (no salen en sus "Mis citas")
  insert into public.appointments (provider_id, user_id, user_email, patient_name, notes, starts_at, ends_at)
  values (
    p_provider_id,
    case when v_staff then null else v_uid end,
    case when v_staff then null else (select email from auth.users where id = v_uid) end,
    v_name, v_notes, p_starts_at, v_ends
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.book_appointment(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.book_appointment(uuid, timestamptz, text, text) to authenticated;
