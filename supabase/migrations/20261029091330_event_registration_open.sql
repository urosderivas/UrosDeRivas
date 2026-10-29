-- Cerrar las inscripciones de un evento sin ocultarlo: se sigue viendo en la web, pero
-- nadie puede inscribirse (lo comprueba create-checkout-session). También se cierran
-- solas al pasar sus fechas, sin tocar esta columna.
alter table public.events add column registration_open boolean not null default true;
