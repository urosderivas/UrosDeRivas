-- Torneos y viajes, parte 2 de 2 (la 1 es 20261022101715): una inscripción por jugador
-- en vez de una por cuenta, y permisos de lo nuevo.
alter table public.event_registrations drop constraint if exists event_registrations_event_id_user_id_key;

revoke execute on function public.update_registration_status(uuid, text) from public, anon;
grant execute on function public.update_registration_status(uuid, text) to authenticated;

-- El panel solo crea (código, precio, nota), lee y borra; asignar un cupón a un pago
-- es cosa de la función de pago
revoke all on public.event_coupons from anon, authenticated;
grant select, delete on public.event_coupons to authenticated;
grant insert (event_id, code, price, note) on public.event_coupons to authenticated;
