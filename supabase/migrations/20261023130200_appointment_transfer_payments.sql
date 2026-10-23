-- Citas de pago por transferencia: el hueco queda apartado hasta que el fisio o un admin
-- marquen la cita como pagada o la cancelen (antes caducaba a los 35 minutos con Stripe).
-- El usuario puede cancelar su cita mientras no esté pagada.
create or replace function public.insert_user_appointment(
  p_user_id uuid, p_provider_id uuid, p_starts_at timestamptz, p_patient_name text, p_notes text, p_pay boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider public.appointment_providers;
  v_name text := btrim(coalesce(p_patient_name, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_id uuid;
begin
  if p_user_id is null then raise exception 'Inicia sesión para reservar una cita.'; end if;

  -- Bloquea el calendario mientras se reserva: dos personas no pueden coger el mismo hueco
  select * into v_provider from public.appointment_providers where id = p_provider_id for update;
  if not found then raise exception 'Este calendario no existe.'; end if;
  if not v_provider.active then raise exception 'Este calendario no admite reservas ahora mismo.'; end if;
  if p_pay and v_provider.price <= 0 then raise exception 'Esta cita es gratis: no hace falta pagar.'; end if;
  if not p_pay and v_provider.price > 0 then raise exception 'Esta cita se paga al reservar. Recarga la página y vuelve a intentarlo.'; end if;

  if length(v_name) not between 1 and 100 then raise exception 'Pon el nombre de quien va a la cita (máximo 100 caracteres).'; end if;
  if v_notes is not null and length(v_notes) > 500 then raise exception 'La nota puede tener como mucho 500 caracteres.'; end if;
  if p_starts_at is null then raise exception 'Elige una hora.'; end if;

  if not exists (
    select 1 from public.get_available_slots(
      p_provider_id,
      (p_starts_at at time zone 'Europe/Madrid')::date,
      (p_starts_at at time zone 'Europe/Madrid')::date
    ) s where s.starts_at = p_starts_at
  ) then
    raise exception 'Esa hora ya no está libre. Elige otra.';
  end if;
  if (
    select count(*) from public.appointments a
    where a.provider_id = p_provider_id and a.user_id = p_user_id
      and a.status = 'booked' and a.starts_at > now()
      and (a.payment is distinct from 'pending' or a.hold_until > now())
  ) >= 3 then
    raise exception 'Ya tienes 3 citas pendientes en este calendario. Cancela alguna o espera a que pasen.';
  end if;

  insert into public.appointments (provider_id, user_id, user_email, patient_name, notes, starts_at, ends_at, payment, amount, hold_until)
  values (
    p_provider_id, p_user_id, (select email from auth.users where id = p_user_id),
    v_name, v_notes, p_starts_at, p_starts_at + make_interval(mins => v_provider.duration_minutes),
    case when p_pay then 'pending' end,
    case when p_pay then v_provider.price end,
    -- Pago por transferencia: el hueco queda guardado hasta que el club la confirme o la cancele
    case when p_pay then 'infinity'::timestamptz end
  )
  returning id into v_id;
  return v_id;
end;
$$;

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
    if v_appt.payment = 'paid' then
      raise exception 'Las citas pagadas se cancelan hablando con el club, que se encarga de la devolución.';
    end if;
  end if;

  -- Sin pagar todavía (transferencia pendiente) se puede cancelar en cualquier momento
  if not public.is_provider_staff(v_appt.provider_id) and v_appt.payment is distinct from 'pending' then
    select cancel_hours into v_cancel_hours from public.appointment_providers where id = v_appt.provider_id;
    if v_appt.starts_at < now() + make_interval(hours => v_cancel_hours) then
      raise exception 'Solo se puede cancelar con % horas de antelación. Habla con el club.', v_cancel_hours;
    end if;
  end if;

  update public.appointments set status = 'cancelled', cancelled_by = v_uid where id = p_appointment_id;
end;
$$;

-- El fisio del calendario o un admin marcan si la transferencia de la cita ha llegado
create or replace function public.set_appointment_payment(p_appointment_id uuid, p_paid boolean)
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
    raise exception 'Solo el fisio de este calendario o un administrador pueden cambiar el pago.';
  end if;
  if v_appt.payment is null then raise exception 'Esta cita es gratis.'; end if;
  if v_appt.payment not in ('pending', 'paid') then raise exception 'Este pago ya no está abierto.'; end if;

  update public.appointments
  set payment = case when p_paid then 'paid' else 'pending' end,
      hold_until = case when p_paid then hold_until else 'infinity'::timestamptz end
  where id = p_appointment_id;
end;
$$;

revoke execute on function public.set_appointment_payment(uuid, boolean) from public, anon;
grant execute on function public.set_appointment_payment(uuid, boolean) to authenticated;
