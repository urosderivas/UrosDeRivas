-- Plazas ocupadas de cada campus, para enseñar "Quedan N plazas" a cualquier
-- visitante. Las inscripciones solo las ven su dueño y los admins, así que esta
-- función devuelve únicamente el total de asistentes por campus, sin datos personales.
-- Cuentan todas las inscripciones no canceladas: pagadas, de pago en mano y
-- pagos online en curso (una sesión de Stripe abandonada se cancela al caducar).
create or replace function public.get_campus_occupancy()
returns table (event_id uuid, taken bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.event_id, coalesce(sum(r.num_attendees), 0)::bigint as taken
  from public.event_registrations r
  where r.status is distinct from 'cancelled'
  group by r.event_id;
$$;

revoke execute on function public.get_campus_occupancy() from public;
grant execute on function public.get_campus_occupancy() to anon, authenticated;
