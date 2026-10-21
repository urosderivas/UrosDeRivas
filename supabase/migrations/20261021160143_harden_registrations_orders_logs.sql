-- Endurece lo que un usuario o un entrenador pueden hacer desde fuera de la web.
-- Se usa alter policy y create or replace en vez de borrar y volver a crear.

-- 1. Inscripciones: solo los estados que usa la web.
alter table public.event_registrations drop constraint if exists event_registrations_status_check;
alter table public.event_registrations add constraint event_registrations_status_check
  check (status in ('pending', 'completed', 'cancelled'));

-- 2. Cambiar el estado de una inscripción o borrarla es cosa de admins: un
--    entrenador podía marcar como pagada cualquier inscripción, o cancelar una
--    pagada. Los entrenadores siguen pudiendo ver las inscripciones.
create or replace function public.update_admin_campus_status(p_event_id uuid, p_user_id uuid, p_status text)
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

  update event_registrations
  set status = p_status
  where event_id = p_event_id and user_id = p_user_id;
end;
$function$;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'event_registrations'
             and policyname = 'Admins and coaches can manage registrations') then
    alter policy "Admins and coaches can manage registrations" on public.event_registrations
      rename to "Admins can delete registrations";
  end if;
end;
$$;
alter policy "Admins can delete registrations" on public.event_registrations
  using (
    exists (select 1 from public.user_roles where user_roles.user_id = (select auth.uid()) and user_roles.role = 'admin')
  );

-- 3. Pedidos de la tienda para pagar en mano (local_...): el navegador solo elige
--    producto, cantidad y opciones. Cantidad entre 1 y 99 y producto obligatorio.
alter policy "Users can insert own pending orders" on public.orders
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and stripe_session_id like 'local\_%'
    and item_id is not null
    and quantity between 1 and 99
  );

-- El importe, el email y la fecha los pone la base de datos, no el navegador.
create or replace function public.set_local_order_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stripe_session_id like 'local\_%' then
    select coalesce(m.price, 0) * greatest(coalesce(new.quantity, 1), 1)
      into new.amount
      from public.market_items m
     where m.id = new.item_id;
    new.amount := coalesce(new.amount, 0);
    new.buyer_email := coalesce(auth.jwt() ->> 'email', new.buyer_email);
    new.created_at := now();
  end if;
  return new;
end;
$$;

-- Un código local_ es de un solo usuario: nadie puede colar un pedido en el de
-- otro copiando el código de su justificante. Necesita ver los pedidos ajenos,
-- por eso es security definer; no se puede llamar desde la API.
create or replace function public.check_local_order_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stripe_session_id like 'local\_%' and exists (
    select 1 from public.orders o
    where o.stripe_session_id = new.stripe_session_id and o.user_id is distinct from new.user_id
  ) then
    raise exception 'Código de pedido no válido.';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_local_order_owner() from public, anon, authenticated;

create or replace trigger check_local_order_owner
  before insert on public.orders
  for each row execute function public.check_local_order_owner();

-- 4. Registro de actividad: el email es el de la sesión, y solo un admin borra.
create or replace function public.set_log_user_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
    new.user_email := auth.jwt() ->> 'email';
  end if;
  return new;
end;
$$;

revoke execute on function public.set_log_user_email() from public, anon, authenticated;

create or replace trigger set_log_user_email
  before insert on public.system_logs
  for each row execute function public.set_log_user_email();

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'system_logs'
             and policyname = 'Admins and Coaches can delete logs') then
    alter policy "Admins and Coaches can delete logs" on public.system_logs
      rename to "Admins can delete logs";
  end if;
end;
$$;
alter policy "Admins can delete logs" on public.system_logs
  using (
    exists (select 1 from public.user_roles where user_roles.user_id = (select auth.uid()) and user_roles.role = 'admin')
  );
