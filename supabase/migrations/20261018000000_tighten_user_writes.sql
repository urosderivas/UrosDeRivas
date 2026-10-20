-- Los pedidos pagados con tarjeta y las inscripciones a campus los crea la Edge
-- Function create-checkout-session con la clave de servicio. Un usuario solo
-- necesita crear desde el navegador los pedidos de "pago en mano" (local_...).
--
-- Antes, un usuario podía insertar filas propias con el stripe_session_id de un
-- pago suyo de otra cosa, y el webhook las marcaba todas como pagadas.
--
-- Se usa alter policy en vez de drop/create: así se aplica sin borrar nada.

alter policy "Users can insert own pending orders" on public.orders
  with check (
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

create or replace trigger set_local_order_amount
  before insert on public.orders
  for each row execute function public.set_local_order_amount();

-- Las inscripciones solo las crea la Edge Function y solo las borra un admin o
-- entrenador desde el panel; un usuario ya no puede borrar una inscripción pagada.
alter policy "Users can register themselves pending" on public.event_registrations
  with check (false);
alter policy "Users can register themselves pending" on public.event_registrations
  rename to "Users cannot insert registrations";
alter policy "Users can unregister themselves" on public.event_registrations
  using (false);
alter policy "Users can unregister themselves" on public.event_registrations
  rename to "Users cannot delete registrations";

-- Cada usuario ve solo su propio rol (antes cualquiera, sin sesión, veía quién es admin).
-- Las políticas que comprueban "es admin" siguen funcionando porque miran la fila propia.
alter policy "Anyone can read user roles" on public.user_roles
  using (user_id = (select auth.uid()));
alter policy "Anyone can read user roles" on public.user_roles
  rename to "Users can read own role";
