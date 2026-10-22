-- Citas de pago y reservas desde la web siempre a nombre de quien reserva.
--
-- - Cada calendario tiene un precio fijo por cita (0 = gratis). Si cuesta dinero, la cita
--   solo se reserva pagando con tarjeta: la función de pago la aparta (payment 'pending')
--   mientras se paga, y el webhook de Stripe la confirma ('paid') o la cancela ('failed').
--   Un apartado sin pagar deja de ocupar el hueco al pasar hold_until.
-- - book_appointment (la página Citas) reserva siempre como usuario, aunque quien reserve
--   sea admin o fisio: así la cita sale en sus "Mis citas". El fisio o un admin apuntan
--   citas desde el panel con add_staff_appointment (sin dueño y sin pago).

alter table public.appointment_providers add column if not exists price numeric(10,2) not null default 0;
alter table public.appointment_providers add constraint appointment_providers_price_check check (price >= 0 and price <= 1000);

alter table public.appointments
  add column if not exists payment text,
  add column if not exists amount numeric(10,2),
  add column if not exists stripe_session_id text,
  add column if not exists hold_until timestamptz;
alter table public.appointments add constraint appointments_payment_check
  check (payment is null or payment in ('pending', 'paid', 'failed'));
create unique index if not exists appointments_stripe_session_idx on public.appointments (stripe_session_id) where stripe_session_id is not null;

-- Huecos libres: igual que antes, pero un apartado para pagar que ha caducado ya no ocupa
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
      jsonb_array_elements(coalesce(
        (select o.ranges from public.appointment_day_hours o where o.provider_id = p.id and o.day = days.day),
        p.weekly_hours -> extract(isodow from days.day)::int::text,
        '[]'::jsonb
      )) r
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
        and (a.payment is distinct from 'pending' or a.hold_until > now())
        and a.starts_at < slots.s + make_interval(mins => slots.duration_minutes) and a.ends_at > slots.s
    )
    and not exists (
      select 1 from public.appointment_blocks b
      where b.provider_id = p_provider_id
        and b.starts_at < slots.s + make_interval(mins => slots.duration_minutes) and b.ends_at > slots.s
    )
  order by slots.s;
$$;

-- Reserva de un usuario en un hueco libre. p_pay = true la aparta para pagar (solo la
-- función de pago, con la clave de servicio); false es una cita gratis.
create or replace function public.insert_user_appointment(
  p_user_id uuid, p_provider_id uuid, p_starts_at timestamptz, p_patient_name text, p_notes text, p_pay boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider public.appointment_providers;
  v_name text := btrim(coalesce(p_patient_name, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_id uuid;
begin
  if p_user_id is null then raise exception 'Inicia sesión para reservar una cita.'; end if;

  -- Bloquea el calendario mientras se reserva: dos personas no pueden coger el mismo hueco
  select * into v_provider from public.appointment_providers where id = p_provider_id for update;
  if not found then raise exception 'Este calendario no existe.'; end if;
  if not v_provider.active then raise exception 'Este calendario no admite reservas ahora mismo.'; end if;
  if p_pay and v_provider.price <= 0 then raise exception 'Esta cita es gratis: no hace falta pagar.'; end if;
  if not p_pay and v_provider.price > 0 then raise exception 'Esta cita se paga al reservar. Recarga la página y vuelve a intentarlo.'; end if;

  if length(v_name) not between 1 and 100 then raise exception 'Pon el nombre de quien va a la cita (máximo 100 caracteres).'; end if;
  if v_notes is not null and length(v_notes) > 500 then raise exception 'La nota puede tener como mucho 500 caracteres.'; end if;
  if p_starts_at is null then raise exception 'Elige una hora.'; end if;

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
    where a.provider_id = p_provider_id and a.user_id = p_user_id
      and a.status = 'booked' and a.starts_at > now()
      and (a.payment is distinct from 'pending' or a.hold_until > now())
  ) >= 3 then
    raise exception 'Ya tienes 3 citas pendientes en este calendario. Cancela alguna o espera a que pasen.';
  end if;

  insert into public.appointments (provider_id, user_id, user_email, patient_name, notes, starts_at, ends_at, payment, amount, hold_until)
  values (
    p_provider_id, p_user_id, (select email from auth.users where id = p_user_id),
    v_name, v_notes, p_starts_at, p_starts_at + make_interval(mins => v_provider.duration_minutes),
    case when p_pay then 'pending' end,
    case when p_pay then v_provider.price end,
    -- Stripe cierra el pago a los 30 minutos; el hueco se guarda un poco más
    case when p_pay then now() + interval '35 minutes' end
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.insert_user_appointment(uuid, uuid, timestamptz, text, text, boolean) from public, anon, authenticated;
grant execute on function public.insert_user_appointment(uuid, uuid, timestamptz, text, text, boolean) to service_role;

-- Página Citas: una cita gratis, a nombre de quien reserva (sea quien sea)
create or replace function public.book_appointment(p_provider_id uuid, p_starts_at timestamptz, p_patient_name text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.insert_user_appointment(auth.uid(), p_provider_id, p_starts_at, p_patient_name, p_notes, false);
end;
$$;

revoke execute on function public.book_appointment(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.book_appointment(uuid, timestamptz, text, text) to authenticated;

-- Panel: el fisio o un admin apuntan una cita (por teléfono, en persona…) a cualquier hora
-- que no choque con otra. No es de ningún usuario y no se paga por la web.
create or replace function public.add_staff_appointment(p_provider_id uuid, p_starts_at timestamptz, p_patient_name text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider public.appointment_providers;
  v_name text := btrim(coalesce(p_patient_name, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_ends timestamptz;
  v_id uuid;
begin
  select * into v_provider from public.appointment_providers where id = p_provider_id for update;
  if not found then raise exception 'Este calendario no existe.'; end if;
  if not public.is_provider_staff(p_provider_id) then
    raise exception 'Solo el fisio de este calendario o un administrador pueden apuntar citas.';
  end if;
  if length(v_name) not between 1 and 100 then raise exception 'Pon el nombre de quien va a la cita (máximo 100 caracteres).'; end if;
  if v_notes is not null and length(v_notes) > 500 then raise exception 'La nota puede tener como mucho 500 caracteres.'; end if;
  if p_starts_at is null then raise exception 'Elige una hora.'; end if;
  v_ends := p_starts_at + make_interval(mins => v_provider.duration_minutes);

  if exists (
    select 1 from public.appointments a
    where a.provider_id = p_provider_id and a.status <> 'cancelled'
      and (a.payment is distinct from 'pending' or a.hold_until > now())
      and a.starts_at < v_ends and a.ends_at > p_starts_at
  ) then
    raise exception 'Ya hay una cita a esa hora.';
  end if;

  insert into public.appointments (provider_id, patient_name, notes, starts_at, ends_at)
  values (p_provider_id, v_name, v_notes, p_starts_at, v_ends)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.add_staff_appointment(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.add_staff_appointment(uuid, timestamptz, text, text) to authenticated;

-- Cancelar: el usuario, su propia cita gratis y con la antelación del calendario (las pagadas,
-- hablando con el club, que hace la devolución); el fisio o un admin, cuando sea
create or replace function public.cancel_appointment(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_appt public.appointments;
  v_cancel_hours integer;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then raise exception 'Esta cita no existe.'; end if;
  if v_appt.status <> 'booked' then raise exception 'Esta cita ya no está pendiente.'; end if;

  if not public.is_provider_staff(v_appt.provider_id) then
    if v_uid is null or v_appt.user_id is distinct from v_uid then
      raise exception 'Solo puedes cancelar tus citas.';
    end if;
    if v_appt.payment = 'pending' then raise exception 'Esta cita está pendiente de pago.'; end if;
    if v_appt.payment = 'paid' then
      raise exception 'Las citas pagadas se cancelan hablando con el club, que se encarga de la devolución.';
    end if;
    select cancel_hours into v_cancel_hours from public.appointment_providers where id = v_appt.provider_id;
    if v_appt.starts_at < now() + make_interval(hours => v_cancel_hours) then
      raise exception 'Solo se puede cancelar con % horas de antelación. Habla con el club.', v_cancel_hours;
    end if;
  end if;

  update public.appointments set status = 'cancelled', cancelled_by = v_uid where id = p_appointment_id;
end;
$$;

-- El fisio o un admin marcan la cita como hecha, no presentada, o la vuelven a dejar pendiente
create or replace function public.set_appointment_status(p_appointment_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then raise exception 'Esta cita no existe.'; end if;
  if not public.is_provider_staff(v_appt.provider_id) then
    raise exception 'Solo el fisio de este calendario o un administrador pueden cambiar la cita.';
  end if;
  if p_status is null or p_status not in ('booked', 'done', 'no_show', 'cancelled') then
    raise exception 'Estado de cita no válido.';
  end if;
  if v_appt.payment = 'pending' and v_appt.hold_until > now() and v_appt.status = 'booked' and p_status <> 'cancelled' then
    raise exception 'Esta cita está pendiente de pago.';
  end if;
  -- Volver a dejarla pendiente no puede pisar otra cita que ocupe ya ese hueco
  if p_status = 'booked' and v_appt.status = 'cancelled' and exists (
    select 1 from public.appointments a
    where a.provider_id = v_appt.provider_id and a.id <> v_appt.id and a.status <> 'cancelled'
      and (a.payment is distinct from 'pending' or a.hold_until > now())
      and a.starts_at < v_appt.ends_at and a.ends_at > v_appt.starts_at
  ) then
    raise exception 'Ese hueco ya lo ocupa otra cita.';
  end if;

  update public.appointments
  set status = p_status,
      cancelled_by = case when p_status = 'cancelled' then auth.uid() else null end
  where id = p_appointment_id;
end;
$$;
