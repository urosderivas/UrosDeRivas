-- Torneos y viajes, y tabla de precios por nº de asistentes y nº de días.
--
-- 1. events.type admite 'torneo' además de 'campus' (pestaña "Torneos y viajes";
--    funcionan igual que los campus: inscripción, aforo y pago con Stripe).
-- 2. events.price_table: precio TOTAL según asistentes y días, como lo cobra el club
--    (p. ej. 1 niño: 18, 36, 54…; 2 hermanos: 30, 60, 90…) y una regla fija a partir
--    de la última fila (+X € por asistente de más y día). Formato:
--      { "byDays": true,  "prices": [[18,36,54],[30,60,90]], "extraAttendee": 5 }
--      { "byDays": false, "prices": [[120],[220]],           "extraAttendee": 100 }
--    Con byDays=false se paga el evento completo (una sola columna, sin elegir días).
--    Si es null, el evento sigue con el sistema anterior (price_per_day, price_tiers,
--    attendee_discounts). La función create-checkout-session calcula el importe con
--    esta misma tabla (supabase/functions/_shared/pricing.ts); el check de abajo
--    impide guardar una tabla incompleta o que no cuadre con las fechas del evento.

alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check check (type in ('campus', 'torneo'));

alter table public.events add column if not exists price_table jsonb;

create or replace function public.is_valid_price_table(t jsonb, num_dates integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  cols integer;
  row_value jsonb;
  cell jsonb;
begin
  if t is null then return true; end if;
  if jsonb_typeof(t) <> 'object'
     or jsonb_typeof(t->'byDays') is distinct from 'boolean'
     or jsonb_typeof(t->'prices') is distinct from 'array'
     or jsonb_typeof(t->'extraAttendee') is distinct from 'number' then
    return false;
  end if;
  if (t->>'extraAttendee')::numeric not between 0 and 100000 then return false; end if;

  cols := case when (t->>'byDays')::boolean then coalesce(num_dates, 0) else 1 end;
  if cols < 1 or cols > 60 then return false; end if;
  if jsonb_array_length(t->'prices') not between 1 and 10 then return false; end if;

  for row_value in select value from jsonb_array_elements(t->'prices') loop
    if jsonb_typeof(row_value) <> 'array' or jsonb_array_length(row_value) <> cols then return false; end if;
    for cell in select value from jsonb_array_elements(row_value) loop
      if jsonb_typeof(cell) <> 'number' or (cell #>> '{}')::numeric not between 0 and 100000 then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;

alter table public.events drop constraint if exists events_price_table_check;
alter table public.events add constraint events_price_table_check
  check (public.is_valid_price_table(price_table, coalesce(array_length(dates, 1), 0)));
