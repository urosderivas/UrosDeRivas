-- Reserva de un usuario en un hueco libre. p_pay = true la aparta para pagar (solo la
-- función de pago, con la clave de servicio); false es una cita gratis.
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
    -- Stripe cierra el pago a los 30 minutos; el hueco se guarda un poco más
    case when p_pay then now() + interval '35 minutes' end
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.insert_user_appointment(uuid, uuid, timestamptz, text, text, boolean) from public, anon, authenticated;
grant execute on function public.insert_user_appointment(uuid, uuid, timestamptz, text, text, boolean) to service_role;

-- Página Citas: una cita gratis, a nombre de quien reserva (sea quien sea)
create or replace function public.book_appointment(p_provider_id uuid, p_starts_at timestamptz, p_patient_name text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.insert_user_appointment(auth.uid(), p_provider_id, p_starts_at, p_patient_name, p_notes, false);
end;
$$;

revoke execute on function public.book_appointment(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.book_appointment(uuid, timestamptz, text, text) to authenticated;
