-- Torneos y viajes: precio por jugador (fijo o a elegir entre opciones), varios
-- jugadores por cuenta y cupones de descuento de un solo uso.
--
-- 1. events.price_options: precio de un torneo o viaje para UN jugador y todos sus días.
--    Una sola opción = precio fijo; varias = el padre elige (p. ej. con o sin autobús):
--      [{"label": "", "price": 255}]
--      [{"label": "Ida y vuelta en bus", "price": 260}, {"label": "Sin bus", "price": 240}]
--    Los campus siguen con price_table. La función create-checkout-session calcula
--    el importe con estas opciones (supabase/functions/_shared/pricing.ts).
-- 2. event_registrations.attendee_key: en torneos y viajes cada inscripción es de un
--    jugador, así que una cuenta puede inscribir a varios (hermanos) en el mismo evento.
--    La clave es el nombre del jugador normalizado; en campus es '' (una por cuenta).
-- 3. event_coupons: códigos que da el club (p. ej. becas). Cada código es de un evento,
--    vale una sola vez y fija el precio final que se paga. Solo los admins los ven y
--    crean; solo la función de pago (con la clave de servicio) los aplica.

-- 1. Opciones de precio
create or replace function public.is_valid_price_options(o jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  opt jsonb;
  n integer;
begin
  if o is null then return true; end if;
  if jsonb_typeof(o) <> 'array' then return false; end if;
  n := jsonb_array_length(o);
  if n not between 1 and 10 then return false; end if;
  for opt in select value from jsonb_array_elements(o) loop
    if jsonb_typeof(opt) <> 'object'
       or jsonb_typeof(opt->'label') is distinct from 'string'
       or jsonb_typeof(opt->'price') is distinct from 'number' then
      return false;
    end if;
    if length(opt->>'label') > 80 then return false; end if;
    if (opt->>'price')::numeric not between 0 and 100000 then return false; end if;
    -- Con varias opciones, cada una necesita un nombre para poder elegirla
    if n > 1 and btrim(opt->>'label') = '' then return false; end if;
  end loop;
  return true;
end;
$$;

alter table public.events add column if not exists price_options jsonb;

alter table public.events drop constraint if exists events_price_options_check;
alter table public.events add constraint events_price_options_check
  check (public.is_valid_price_options(price_options));

-- Los torneos guardados con tabla pasan a precio fijo: el de 1 asistente
update public.events
set price_options = jsonb_build_array(jsonb_build_object('label', '', 'price', price_table->'prices'->0->0))
where type = 'torneo' and price_options is null and price_table is not null
  and public.is_valid_price_table(price_table, coalesce(array_length(dates, 1), 0));

-- 2. Varias inscripciones por cuenta en torneos y viajes (una por jugador)
alter table public.event_registrations add column if not exists attendee_key text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_registrations_event_user_attendee_key') then
    alter table public.event_registrations
      add constraint event_registrations_event_user_attendee_key unique (event_id, user_id, attendee_key);
  end if;
end;
$$;
alter table public.event_registrations drop constraint if exists event_registrations_event_id_user_id_key;

-- Cambiar el estado de una inscripción concreta (con varias por cuenta, la cuenta ya no basta)
create or replace function public.update_registration_status(p_registration_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (
    select 1 from user_roles where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Solo un administrador puede cambiar el estado de una inscripción.';
  end if;

  if p_status is null or p_status not in ('pending', 'completed', 'cancelled') then
    raise exception 'Estado de inscripción no válido.';
  end if;

  update event_registrations set status = p_status where id = p_registration_id;
end;
$function$;

revoke execute on function public.update_registration_status(uuid, text) from public, anon;
grant execute on function public.update_registration_status(uuid, text) to authenticated;

-- 3. Cupones
create table if not exists public.event_coupons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  -- Precio final que paga quien lo use (0 = gratis; Stripe no cobra menos de 0,50 €)
  price numeric(10, 2) not null,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  -- Pago al que está asignado. El cupón está usado si la inscripción de ese pago está
  -- completada, y en uso mientras ese pago siga abierto; lo comprueba la función de pago.
  stripe_session_id text,
  user_id uuid references auth.users(id) on delete set null,
  constraint event_coupons_code_key unique (code),
  constraint event_coupons_code_check check (code ~ '^[A-Z0-9]{4,20}$'),
  constraint event_coupons_price_check check (price = 0 or price between 0.5 and 100000),
  constraint event_coupons_note_check check (note is null or length(note) <= 120)
);

create index if not exists event_coupons_event_id_idx on public.event_coupons (event_id);

alter table public.event_coupons enable row level security;

-- El panel solo crea (código, precio, nota), lee y borra; asignar un cupón a un pago
-- es cosa de la función de pago
revoke all on public.event_coupons from anon, authenticated;
grant select, delete on public.event_coupons to authenticated;
grant insert (event_id, code, price, note) on public.event_coupons to authenticated;

drop policy if exists "Admins manage coupons" on public.event_coupons;
create policy "Admins manage coupons" on public.event_coupons
  for all
  using (
    exists (select 1 from public.user_roles where user_roles.user_id = (select auth.uid()) and user_roles.role = 'admin')
  )
  with check (
    exists (select 1 from public.user_roles where user_roles.user_id = (select auth.uid()) and user_roles.role = 'admin')
  );
