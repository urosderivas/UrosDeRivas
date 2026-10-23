-- Citas de pago y reservas desde la web siempre a nombre de quien reserva.
--
-- - Cada calendario tiene un precio fijo por cita (0 = gratis). Si cuesta dinero, la cita
--   solo se reserva pagando con tarjeta: la función de pago la aparta (payment 'pending')
--   mientras se paga, y el webhook de Stripe la confirma ('paid') o la cancela ('failed').
--   Un apartado sin pagar deja de ocupar el hueco al pasar hold_until.
-- - book_appointment (la página Citas) reserva siempre como usuario, aunque quien reserve
--   sea admin o fisio: así la cita sale en sus "Mis citas". El fisio o un admin apuntan
--   citas desde el panel con add_staff_appointment (sin dueño y sin pago).

alter table public.appointment_providers add column if not exists price numeric(10,2) not null default 0;
alter table public.appointment_providers add constraint appointment_providers_price_check check (price >= 0 and price <= 1000);

alter table public.appointments
  add column if not exists payment text,
  add column if not exists amount numeric(10,2),
  add column if not exists stripe_session_id text,
  add column if not exists hold_until timestamptz;
alter table public.appointments add constraint appointments_payment_check
  check (payment is null or payment in ('pending', 'paid', 'failed'));
create unique index if not exists appointments_stripe_session_idx on public.appointments (stripe_session_id) where stripe_session_id is not null;
