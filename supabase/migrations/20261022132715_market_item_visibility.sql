-- Productos ocultables: la tienda deja de mostrarlos (y la función de pago no deja
-- comprarlos) sin borrarlos, para no perder los pedidos que ya los citan.
alter table public.market_items add column if not exists active boolean not null default true;
