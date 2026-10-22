create policy "Anyone can read active providers" on public.appointment_providers
  for select using (active or public.is_provider_staff(id));
-- Un fisio crea y edita solo su calendario; un admin, cualquiera
create policy "Physios and admins create providers" on public.appointment_providers
  for insert with check (
    public.has_role(array['admin'])
    or (public.has_role(array['fisio']) and user_id = (select auth.uid()))
  );
create policy "Physios and admins update providers" on public.appointment_providers
  for update using (public.is_provider_staff(id))
  with check (
    public.has_role(array['admin'])
    or (public.has_role(array['fisio']) and user_id = (select auth.uid()))
  );
create policy "Admins delete providers" on public.appointment_providers
  for delete using (public.has_role(array['admin']));

create policy "Staff manage blocks" on public.appointment_blocks
  for all using (public.is_provider_staff(provider_id))
  with check (public.is_provider_staff(provider_id));

create policy "Users read own appointments and staff theirs" on public.appointments
  for select using (user_id = (select auth.uid()) or public.is_provider_staff(provider_id));
