-- Al borrar una cuenta se guardan sus pedidos, inscripciones y registros (el club los
-- necesita para sus cuentas), ya sin la cuenta. Antes los pedidos y los registros de
-- actividad impedían borrarla y las inscripciones se borraban con ella.
alter table public.orders drop constraint orders_user_id_fkey;
alter table public.orders add constraint orders_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.system_logs drop constraint system_logs_user_id_fkey;
alter table public.system_logs add constraint system_logs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.events drop constraint events_created_by_fkey;
alter table public.events add constraint events_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.event_registrations drop constraint event_registrations_user_id_fkey;
alter table public.event_registrations add constraint event_registrations_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- Las inscripciones de cuentas borradas siguen saliendo en el panel, sin email
create or replace function public.get_event_registrations(target_event_id uuid)
returns table(registration_id uuid, event_id uuid, user_id uuid, user_email text, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.has_role(array['admin', 'coach']) then
    raise exception 'Solo admin o coach puede ver las inscripciones';
  end if;

  return query
  select er.id, er.event_id, er.user_id, coalesce(u.email::text, ''), er.created_at
  from public.event_registrations er
  left join auth.users u on er.user_id = u.id
  where er.event_id = target_event_id
  order by er.created_at desc;
end;
$function$;

-- Borrar la propia cuenta desde "Mi cuenta". Solo si no queda nada en curso: pedidos sin
-- pagar o sin entregar, inscripciones sin pagar o de eventos que no han terminado, y citas
-- por venir o sin pagar. Así el club no se queda con un pago o una plaza sin saber de quién.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Inicia sesión para borrar tu cuenta';
  end if;

  -- Un admin, entrenador, tienda o fisio se lleva cosas del club con su cuenta (p. ej. el
  -- calendario de citas): primero le quita el rol otro admin
  if public.has_role(array['admin', 'coach', 'tienda', 'fisio']) then
    raise exception 'Las cuentas del club (admin, entrenador, tienda o fisio) las borra un administrador desde el panel.';
  end if;

  if exists (select 1 from public.orders where user_id = v_uid and status in ('pending', 'processing'))
    or exists (
      select 1 from public.event_registrations r
      left join public.events e on e.id = r.event_id
      where r.user_id = v_uid and r.status <> 'cancelled'
        and (r.status = 'pending'
             or coalesce((select max(d) from unnest(e.dates) d), (e.date at time zone 'Europe/Madrid')::date)
                >= (now() at time zone 'Europe/Madrid')::date)
    )
    or exists (
      select 1 from public.appointments
      where user_id = v_uid and status = 'booked' and (ends_at > now() or payment = 'pending')
    )
  then
    raise exception 'Tienes pedidos, inscripciones o citas en curso. Cuando terminen podrás borrar la cuenta; si lo necesitas antes, escribe al club.';
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
