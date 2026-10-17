-- Esquema base de UrosDeRivas.
-- Copia fiel de lo que había en producción el 17/10/2026 (tablas, restricciones,
-- RLS, funciones y triggers del esquema public). No cambia nada: sirve para poder
-- recrear la base de datos desde cero y para que los cambios futuros vayan en
-- migraciones nuevas.
-- Sustituye a 20260328172800_add_custom_fields.sql, que ya está incluida aquí.

-- ============================================================
-- Tablas
-- ============================================================

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user'
    constraint user_roles_role_check check (role = any (array['admin', 'coach', 'user']))
);

create table if not exists public.market_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric not null,
  image_url text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  sizes text[] default '{}'::text[],
  stripe_price_id text,
  custom_fields jsonb default '[]'::jsonb
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date timestamptz not null,
  location text not null,
  image_url text,
  description text,
  type text not null
    constraint events_type_check check (type = 'campus'),
  created_by uuid references auth.users(id),
  dates date[] default '{}'::date[],
  price_per_day numeric default 0,
  price_tiers jsonb default '[]'::jsonb,
  attendee_discounts jsonb default '[]'::jsonb,
  schedule text,
  custom_fields jsonb default '[]'::jsonb,
  max_capacity integer,
  active boolean default true
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  selected_days date[] default '{}'::date[],
  num_attendees integer default 1,
  attendee_names text[],
  amount numeric default 0,
  status text default 'pending',
  stripe_session_id text,
  custom_data jsonb default '{}'::jsonb,
  constraint event_registrations_event_id_user_id_key unique (event_id, user_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  buyer_name text not null,
  buyer_email text not null,
  item_id uuid references public.market_items(id),
  status text not null default 'pending'
    constraint orders_status_check check (status = any (array['pending', 'processing', 'completed', 'cancelled'])),
  amount numeric not null,
  stripe_session_id text,
  created_at timestamptz not null default timezone('utc', now()),
  size text,
  quantity integer not null default 1
);

create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  metadata jsonb,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc', now()),
  user_email text
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.user_roles enable row level security;
alter table public.market_items enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.orders enable row level security;
alter table public.system_logs enable row level security;

-- user_roles: cualquiera puede leer roles; solo se escriben desde funciones
-- security definer o desde el panel de Supabase.
drop policy if exists "Anyone can read user roles" on public.user_roles;
create policy "Anyone can read user roles" on public.user_roles
  for select using (true);

-- market_items: lectura pública, escritura solo admin.
drop policy if exists "Anyone can read market items" on public.market_items;
create policy "Anyone can read market items" on public.market_items
  for select using (true);

drop policy if exists "Admins can insert market items" on public.market_items;
create policy "Admins can insert market items" on public.market_items
  for insert with check (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

drop policy if exists "Admins can update market items" on public.market_items;
create policy "Admins can update market items" on public.market_items
  for update using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

drop policy if exists "Admins can delete market items" on public.market_items;
create policy "Admins can delete market items" on public.market_items
  for delete using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

-- events: lectura pública; admin gestiona todos, coach solo los suyos.
drop policy if exists "Anyone can read events" on public.events;
create policy "Anyone can read events" on public.events
  for select using (true);

drop policy if exists "Admins and Coaches can insert events" on public.events;
create policy "Admins and Coaches can insert events" on public.events
  for insert with check (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = any (array['admin', 'coach']))
  );

drop policy if exists "Admins and Coaches can update events" on public.events;
create policy "Admins and Coaches can update events" on public.events
  for update using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
    or (
      exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'coach')
      and created_by = auth.uid()
    )
  );

drop policy if exists "Admins and Coaches can delete events" on public.events;
create policy "Admins and Coaches can delete events" on public.events
  for delete using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
    or (
      exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'coach')
      and created_by = auth.uid()
    )
  );

-- event_registrations: el usuario solo se inscribe en estado pending; el cambio
-- de estado lo hacen la Edge Function (service role) o update_admin_campus_status.
drop policy if exists "Users can read own registrations" on public.event_registrations;
create policy "Users can read own registrations" on public.event_registrations
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = any (array['admin', 'coach']))
  );

drop policy if exists "Users can register themselves pending" on public.event_registrations;
create policy "Users can register themselves pending" on public.event_registrations
  for insert with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "Users can unregister themselves" on public.event_registrations;
create policy "Users can unregister themselves" on public.event_registrations
  for delete using (auth.uid() = user_id);

drop policy if exists "Admins and coaches can manage registrations" on public.event_registrations;
create policy "Admins and coaches can manage registrations" on public.event_registrations
  for delete using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = any (array['admin', 'coach']))
  );

-- orders: el usuario solo crea pedidos propios en pending; solo admin actualiza.
-- La política "Users can insert own orders" (sin comprobar el estado) se eliminó
-- el 17/10/2026 y no debe volver.
drop policy if exists "Users can insert own orders" on public.orders;

drop policy if exists "Users can read own orders" on public.orders;
create policy "Users can read own orders" on public.orders
  for select using (user_id = auth.uid());

drop policy if exists "Users can insert own pending orders" on public.orders;
create policy "Users can insert own pending orders" on public.orders
  for insert with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "Admins can read all orders" on public.orders;
create policy "Admins can read all orders" on public.orders
  for select using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

drop policy if exists "Admins can insert any order" on public.orders;
create policy "Admins can insert any order" on public.orders
  for insert with check (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders" on public.orders
  for update using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

-- system_logs
drop policy if exists "Users can insert own logs" on public.system_logs;
create policy "Users can insert own logs" on public.system_logs
  for insert with check (auth.uid() = user_id);

drop policy if exists "Admins and Coaches can read logs" on public.system_logs;
create policy "Admins and Coaches can read logs" on public.system_logs
  for select using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = any (array['admin', 'coach']))
  );

drop policy if exists "Admins and Coaches can delete logs" on public.system_logs;
create policy "Admins and Coaches can delete logs" on public.system_logs
  for delete using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = any (array['admin', 'coach']))
  );

-- ============================================================
-- Funciones
-- Todas son security definer y comprueban el rol con auth.uid() por dentro.
-- ============================================================

-- Rol 'user' por defecto para cada usuario nuevo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.get_system_users()
returns table(id uuid, email text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_is_admin boolean;
begin
  v_uid := auth.uid();

  select exists (
    select 1 from public.user_roles
    where user_id = v_uid and public.user_roles.role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    return;
  end if;

  return query
  select
    u.id,
    u.email::text,
    r.role::text,
    u.created_at
  from auth.users as u
  left join public.user_roles as r on u.id = r.user_id
  order by u.created_at desc;
end;
$function$;

create or replace function public.delete_user_account(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_is_admin boolean;
begin
  v_uid := auth.uid();

  select exists (
    select 1 from user_roles
    where user_id = v_uid and role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Solo admin puede eliminar usuarios';
  end if;

  delete from auth.users where id = target_user_id;
end;
$function$;

create or replace function public.delete_admin_order(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_is_admin boolean;
begin
  v_uid := auth.uid();

  select exists (
    select 1 from user_roles
    where user_id = v_uid and role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Not authorized. Only admins can delete orders.';
  end if;

  delete from orders where id = target_order_id;
end;
$function$;

create or replace function public.get_event_registrations(target_event_id uuid)
returns table(registration_id uuid, event_id uuid, user_id uuid, user_email text, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_is_admin boolean;
begin
  v_uid := auth.uid();

  select exists (
    select 1 from public.user_roles
    where public.user_roles.user_id = v_uid and public.user_roles.role in ('admin', 'coach')
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Solo admin o coach puede ver las inscripciones';
  end if;

  return query
  select
    er.id,
    er.event_id,
    er.user_id,
    u.email::text,
    er.created_at
  from public.event_registrations er
  join auth.users u on er.user_id = u.id
  where er.event_id = target_event_id
  order by er.created_at desc;
end;
$function$;

create or replace function public.update_admin_campus_status(p_event_id uuid, p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid;
  v_is_admin boolean;
begin
  v_uid := auth.uid();

  select exists (
    select 1 from user_roles
    where user_id = v_uid and role in ('admin', 'coach')
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Solo admin/coach puede modificar estado de inscripciones';
  end if;

  update event_registrations
  set status = p_status
  where event_id = p_event_id and user_id = p_user_id;
end;
$function$;

-- Nota: producción tiene además la función public.rls_auto_enable() y el event
-- trigger ensure_rls, que activan RLS en cada tabla nueva de public. Los crea
-- Supabase desde su panel, así que no se versionan aquí.
