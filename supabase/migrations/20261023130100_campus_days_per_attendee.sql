-- Campus: cada asistente elige sus días. attendee_days guarda los días de cada uno,
-- en el orden de attendee_names; selected_days sigue siendo la unión de todos
-- (en las inscripciones antiguas todos los asistentes van los mismos días).
alter table public.event_registrations
  add column if not exists attendee_days jsonb check (attendee_days is null or jsonb_typeof(attendee_days) = 'array');
