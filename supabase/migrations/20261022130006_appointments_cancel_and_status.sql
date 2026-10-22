-- Cancelar: el usuario, su propia cita y con la antelación del calendario; el fisio o un admin, cuando sea
create or replace function public.cancel_appointment(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_appt public.appointments;
  v_cancel_hours integer;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then raise exception 'Esta cita no existe.'; end if;
  if v_appt.status <> 'booked' then raise exception 'Esta cita ya no está pendiente.'; end if;

  if not public.is_provider_staff(v_appt.provider_id) then
    if v_uid is null or v_appt.user_id is distinct from v_uid then
      raise exception 'Solo puedes cancelar tus citas.';
    end if;
    select cancel_hours into v_cancel_hours from public.appointment_providers where id = v_appt.provider_id;
    if v_appt.starts_at < now() + make_interval(hours => v_cancel_hours) then
      raise exception 'Solo se puede cancelar con % horas de antelación. Habla con el club.', v_cancel_hours;
    end if;
  end if;

  update public.appointments set status = 'cancelled', cancelled_by = v_uid where id = p_appointment_id;
end;
$$;

revoke execute on function public.cancel_appointment(uuid) from public, anon;
grant execute on function public.cancel_appointment(uuid) to authenticated;

-- El fisio o un admin marcan la cita como hecha, no presentada, o la vuelven a dejar pendiente
create or replace function public.set_appointment_status(p_appointment_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments;
begin
  select * into v_appt from public.appointments where id = p_appointment_id;
  if not found then raise exception 'Esta cita no existe.'; end if;
  if not public.is_provider_staff(v_appt.provider_id) then
    raise exception 'Solo el fisio de este calendario o un administrador pueden cambiar la cita.';
  end if;
  if p_status is null or p_status not in ('booked', 'done', 'no_show', 'cancelled') then
    raise exception 'Estado de cita no válido.';
  end if;
  -- Volver a dejarla pendiente no puede pisar otra cita que ocupe ya ese hueco
  if p_status = 'booked' and v_appt.status = 'cancelled' and exists (
    select 1 from public.appointments a
    where a.provider_id = v_appt.provider_id and a.id <> v_appt.id and a.status <> 'cancelled'
      and a.starts_at < v_appt.ends_at and a.ends_at > v_appt.starts_at
  ) then
    raise exception 'Ese hueco ya lo ocupa otra cita.';
  end if;

  update public.appointments
  set status = p_status,
      cancelled_by = case when p_status = 'cancelled' then auth.uid() else null end
  where id = p_appointment_id;
end;
$$;

revoke execute on function public.set_appointment_status(uuid, text) from public, anon;
grant execute on function public.set_appointment_status(uuid, text) to authenticated;
