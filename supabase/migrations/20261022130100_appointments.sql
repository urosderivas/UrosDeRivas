-- Citas de fisioterapia y recuperación, al estilo de Calendly.
--
-- - appointment_providers: el calendario de cada fisio (usuario con rol 'fisio'): servicio,
--   duración de la cita, horario semanal y reglas de reserva. Lo ve todo el mundo.
-- - appointment_blocks: huecos que el fisio cierra (vacaciones, un partido...). Solo él y los admins.
-- - appointments: las citas. Cada usuario ve las suyas; el fisio, las de su calendario.
--   Solo se crean y cambian con las funciones de abajo, que comprueban el hueco.
-- Las horas del horario semanal son de Madrid (Europe/Madrid).

-- Horario semanal: {"1": [["09:00", "13:00"], ["16:00", "20:00"]], ..., "7": []}
-- (1 = lunes ... 7 = domingo; cada tramo empieza antes de acabar; hasta 6 tramos por día)
create or replace function public.is_valid_weekly_hours(h jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  ranges jsonb;
  r jsonb;
begin
  if h is null or jsonb_typeof(h) <> 'object' then return false; end if;
  for k, ranges in select key, value from jsonb_each(h) loop
    if k not in ('1', '2', '3', '4', '5', '6', '7') then return false; end if;
    if jsonb_typeof(ranges) <> 'array' or jsonb_array_length(ranges) > 6 then return false; end if;
    for r in select value from jsonb_array_elements(ranges) loop
      if jsonb_typeof(r) <> 'array' or jsonb_array_length(r) <> 2
         or jsonb_typeof(r->0) <> 'string' or jsonb_typeof(r->1) <> 'string'
         or (r->>0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or (r->>1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$'
         or (r->>0)::time >= (case when r->>1 = '24:00' then '23:59:59'::time else (r->>1)::time end) then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

create table if not exists public.appointment_providers (
  id uuid primary key default gen_random_uuid(),
  -- El fisio dueño del calendario
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  service text not null,
  description text,
  duration_minutes integer not null default 45,
  weekly_hours jsonb not null default '{}'::jsonb,
  -- Con cuánta antelación mínima se puede reservar, hasta cuántos días vista
  -- y hasta cuántas horas antes puede cancelar el usuario
  min_notice_hours integer not null default 12,
  max_days_ahead integer not null default 30,
  cancel_hours integer not null default 24,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  constraint appointment_providers_user_id_key unique (user_id),
  constraint appointment_providers_name_check check (length(btrim(name)) between 1 and 80),
  constraint appointment_providers_service_check check (length(btrim(service)) between 1 and 60),
  constraint appointment_providers_description_check check (description is null or length(description) <= 1000),
  constraint appointment_providers_duration_check check (duration_minutes between 10 and 240),
  constraint appointment_providers_hours_check check (public.is_valid_weekly_hours(weekly_hours)),
  constraint appointment_providers_notice_check check (min_notice_hours between 0 and 168),
  constraint appointment_providers_ahead_check check (max_days_ahead between 1 and 120),
  constraint appointment_providers_cancel_check check (cancel_hours between 0 and 168)
);

create table if not exists public.appointment_blocks (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.appointment_providers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint appointment_blocks_range_check check (ends_at > starts_at and ends_at - starts_at <= interval '120 days'),
  constraint appointment_blocks_note_check check (note is null or length(note) <= 200)
);

create index if not exists appointment_blocks_provider_idx on public.appointment_blocks (provider_id, starts_at);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.appointment_providers(id) on delete cascade,
  -- Quien reservó; vacío si la apuntó el fisio o un admin
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  patient_name text not null,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked',
  cancelled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint appointments_range_check check (ends_at > starts_at),
  constraint appointments_status_check check (status in ('booked', 'done', 'no_show', 'cancelled')),
  constraint appointments_patient_check check (length(btrim(patient_name)) between 1 and 100),
  constraint appointments_notes_check check (notes is null or length(notes) <= 500)
);

create index if not exists appointments_provider_idx on public.appointments (provider_id, starts_at);
create index if not exists appointments_user_idx on public.appointments (user_id);

-- ¿Es el usuario actual el fisio de este calendario, o un admin?
create or replace function public.is_provider_staff(p_provider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(array['admin'])
    or exists (
      select 1 from public.appointment_providers p
      where p.id = p_provider_id and p.user_id = (select auth.uid())
        and public.has_role(array['fisio'])
    );
$$;

-- Las políticas la usan también con visitantes sin sesión (para ellos siempre es false)
grant execute on function public.is_provider_staff(uuid) to anon, authenticated;

-- Permisos de tabla: las citas solo se leen (se crean y cambian con las funciones)
revoke all on public.appointment_providers, public.appointment_blocks, public.appointments from anon, authenticated;
grant select on public.appointment_providers to anon, authenticated;
grant insert, update, delete on public.appointment_providers to authenticated;
grant select, insert, delete on public.appointment_blocks to authenticated;
grant select on public.appointments to authenticated;

alter table public.appointment_providers enable row level security;
alter table public.appointment_blocks enable row level security;
alter table public.appointments enable row level security;

create policy "Anyone can read active providers" on public.appointment_providers
  for select using (active or public.is_provider_staff(id));
-- Un fisio crea y edita solo su calendario; un admin, cualquiera
create policy "Physios and admins create providers" on public.appointment_providers
  for insert with check (
    public.has_role(array['admin'])
    or (public.has_role(array['fisio']) and user_id = (select auth.uid()))
  );
create policy "Physios and admins update providers" on public.appointment_providers
  for update using (public.is_provider_staff(id))
  with check (
    public.has_role(array['admin'])
    or (public.has_role(array['fisio']) and user_id = (select auth.uid()))
  );
create policy "Admins delete providers" on public.appointment_providers
  for delete using (public.has_role(array['admin']));

create policy "Staff manage blocks" on public.appointment_blocks
  for all using (public.is_provider_staff(provider_id))
  with check (public.is_provider_staff(provider_id));

create policy "Users read own appointments and staff theirs" on public.appointments
  for select using (user_id = (select auth.uid()) or public.is_provider_staff(provider_id));

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

-- Cancelar: el usuario, su propia cita y con la antelación del calendario; el fisio o un admin, cuando sea
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
    select cancel_hours into v_cancel_hours from public.appointment_providers where id = v_appt.provider_id;
    if v_appt.starts_at < now() + make_interval(hours => v_cancel_hours) then
      raise exception 'Solo se puede cancelar con % horas de antelación. Habla con el club.', v_cancel_hours;
    end if;
  end if;

  update public.appointments set status = 'cancelled', cancelled_by = v_uid where id = p_appointment_id;
end;
$$;

revoke execute on function public.cancel_appointment(uuid) from public, anon;
grant execute on function public.cancel_appointment(uuid) to authenticated;

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
  -- Volver a dejarla pendiente no puede pisar otra cita que ocupe ya ese hueco
  if p_status = 'booked' and v_appt.status = 'cancelled' and exists (
    select 1 from public.appointments a
    where a.provider_id = v_appt.provider_id and a.id <> v_appt.id and a.status <> 'cancelled'
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

revoke execute on function public.set_appointment_status(uuid, text) from public, anon;
grant execute on function public.set_appointment_status(uuid, text) to authenticated;
