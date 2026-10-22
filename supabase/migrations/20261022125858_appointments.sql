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

-- Mientras se aplican los permisos (siguiente parte), nadie de fuera toca estas tablas
alter table public.appointment_providers enable row level security;
alter table public.appointment_blocks enable row level security;
alter table public.appointments enable row level security;

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
