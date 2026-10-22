-- Panel: el fisio o un admin apuntan una cita (por teléfono, en persona…) a cualquier hora
-- que no choque con otra. No es de ningún usuario y no se paga por la web.
create or replace function public.add_staff_appointment(p_provider_id uuid, p_starts_at timestamptz, p_patient_name text, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider public.appointment_providers;
  v_name text := btrim(coalesce(p_patient_name, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_ends timestamptz;
  v_id uuid;
begin
  select * into v_provider from public.appointment_providers where id = p_provider_id for update;
  if not found then raise exception 'Este calendario no existe.'; end if;
  if not public.is_provider_staff(p_provider_id) then
    raise exception 'Solo el fisio de este calendario o un administrador pueden apuntar citas.';
  end if;
  if length(v_name) not between 1 and 100 then raise exception 'Pon el nombre de quien va a la cita (máximo 100 caracteres).'; end if;
  if v_notes is not null and length(v_notes) > 500 then raise exception 'La nota puede tener como mucho 500 caracteres.'; end if;
  if p_starts_at is null then raise exception 'Elige una hora.'; end if;
  v_ends := p_starts_at + make_interval(mins => v_provider.duration_minutes);

  if exists (
    select 1 from public.appointments a
    where a.provider_id = p_provider_id and a.status <> 'cancelled'
      and (a.payment is distinct from 'pending' or a.hold_until > now())
      and a.starts_at < v_ends and a.ends_at > p_starts_at
  ) then
    raise exception 'Ya hay una cita a esa hora.';
  end if;

  insert into public.appointments (provider_id, patient_name, notes, starts_at, ends_at)
  values (p_provider_id, v_name, v_notes, p_starts_at, v_ends)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.add_staff_appointment(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.add_staff_appointment(uuid, timestamptz, text, text) to authenticated;
