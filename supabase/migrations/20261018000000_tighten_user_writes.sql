-- Los pedidos pagados con tarjeta y las inscripciones a campus los crea la Edge
-- Function create-checkout-session con la clave de servicio. Un usuario solo
-- necesita crear desde el navegador los pedidos de "pago en mano" (local_...).
--
-- Antes, un usuario podía insertar filas propias con el stripe_session_id de un
-- pago suyo de otra cosa, y el webhook las marcaba todas como pagadas.

drop policy if exists "Users can insert own pending orders" on public.orders;
create policy "Users can insert own pending orders" on public.orders
  for insert with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and stripe_session_id like 'local\_%'
  );

-- El importe de un pedido de pago en mano se calcula aquí, no en el navegador.
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
  end if;
  return new;
end;
$$;

drop trigger if exists set_local_order_amount on public.orders;
create trigger set_local_order_amount
  before insert on public.orders
  for each row execute function public.set_local_order_amount();

-- Las inscripciones solo las crea la Edge Function y solo las borra un admin o
-- entrenador desde el panel; un usuario ya no puede borrar una inscripción pagada.
drop policy if exists "Users can register themselves pending" on public.event_registrations;
drop policy if exists "Users can unregister themselves" on public.event_registrations;

-- Cada usuario ve solo su propio rol (antes cualquiera, sin sesión, veía quién es admin).
-- Las políticas que comprueban "es admin" siguen funcionando porque miran la fila propia.
drop policy if exists "Anyone can read user roles" on public.user_roles;
create policy "Users can read own role" on public.user_roles
  for select using (user_id = (select auth.uid()));
