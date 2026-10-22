-- Aforo sin carreras: la función de pago ya comprueba las plazas antes de cobrar, pero dos
-- familias que se inscriben en el mismo segundo podían coger la misma última plaza. Ahora,
-- al guardar una inscripción que ocupa plazas, se bloquea su evento (las demás inscripciones
-- a ese evento esperan) y se cuentan las plazas otra vez. Igual que las citas con su calendario.
-- Un admin que reactiva una inscripción desde el panel puede pasarse del aforo a propósito.

create or replace function public.check_registration_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_type text;
  v_taken bigint;
  v_noun text;
begin
  if new.status is not distinct from 'cancelled' then return new; end if;
  -- Solo cuando ocupa plazas nuevas: alta, reactivación o más asistentes
  if tg_op = 'UPDATE' and old.status is distinct from 'cancelled'
     and coalesce(new.num_attendees, 1) <= coalesce(old.num_attendees, 1)
     and new.event_id is not distinct from old.event_id then
    return new;
  end if;
  if public.has_role(array['admin']) then return new; end if;

  select max_capacity, type into v_capacity, v_type from public.events where id = new.event_id for update;
  if v_capacity is null then return new; end if;

  select coalesce(sum(coalesce(r.num_attendees, 1)), 0) into v_taken
  from public.event_registrations r
  where r.event_id = new.event_id and r.status is distinct from 'cancelled' and r.id <> new.id
    -- al rehacer un pago, la inscripción que se va a sustituir (upsert) no cuenta
    and not (r.user_id = new.user_id and r.attendee_key = new.attendee_key);

  if v_taken + coalesce(new.num_attendees, 1) > v_capacity then
    v_noun := case when v_type = 'torneo' then 'evento' else 'campus' end;
    if v_taken >= v_capacity then raise exception 'Este % está completo.', v_noun; end if;
    if v_capacity - v_taken = 1 then raise exception 'Solo queda 1 plaza en este %.', v_noun; end if;
    raise exception 'Solo quedan % plazas en este %.', v_capacity - v_taken, v_noun;
  end if;
  return new;
end;
$$;

revoke execute on function public.check_registration_capacity() from public, anon, authenticated;

create trigger event_registrations_capacity
  before insert or update of status, num_attendees, event_id on public.event_registrations
  for each row execute function public.check_registration_capacity();
