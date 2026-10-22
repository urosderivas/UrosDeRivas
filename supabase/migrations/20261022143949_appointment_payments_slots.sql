-- Huecos libres: igual que antes, pero un apartado para pagar que ha caducado ya no ocupa
create or replace function public.get_available_slots(p_provider_id uuid, p_from date, p_to date)
returns table (starts_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select * from public.appointment_providers
    where id = p_provider_id and active
  ),
  today as (select (now() at time zone 'Europe/Madrid')::date as d),
  days as (
    select g::date as day
    from p, today,
      generate_series(
        greatest(p_from, today.d),
        least(p_to, today.d + p.max_days_ahead, greatest(p_from, today.d) + 62),
        interval '1 day'
      ) g
  ),
  ranges as (
    select days.day, (r->>0)::time as t0,
      case when r->>1 = '24:00' then interval '24 hours' else (r->>1)::time - time '00:00' end as t1
    from days, p,
      jsonb_array_elements(coalesce(
        (select o.ranges from public.appointment_day_hours o where o.provider_id = p.id and o.day = days.day),
        p.weekly_hours -> extract(isodow from days.day)::int::text,
        '[]'::jsonb
      )) r
  ),
  slots as (
    select ((ranges.day + ranges.t0 + n * make_interval(mins => p.duration_minutes)) at time zone 'Europe/Madrid') as s,
      p.duration_minutes, p.min_notice_hours
    from ranges, p,
      generate_series(0, floor(extract(epoch from (ranges.t1 - (ranges.t0 - time '00:00'))) / 60 / p.duration_minutes)::int - 1) n
  )
  select slots.s
  from slots
  where slots.s >= now() + make_interval(hours => slots.min_notice_hours)
    and not exists (
      select 1 from public.appointments a
      where a.provider_id = p_provider_id and a.status <> 'cancelled'
        and (a.payment is distinct from 'pending' or a.hold_until > now())
        and a.starts_at < slots.s + make_interval(mins => slots.duration_minutes) and a.ends_at > slots.s
    )
    and not exists (
      select 1 from public.appointment_blocks b
      where b.provider_id = p_provider_id
        and b.starts_at < slots.s + make_interval(mins => slots.duration_minutes) and b.ends_at > slots.s
    )
  order by slots.s;
$$;
