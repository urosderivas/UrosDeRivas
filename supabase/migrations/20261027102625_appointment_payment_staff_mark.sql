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
