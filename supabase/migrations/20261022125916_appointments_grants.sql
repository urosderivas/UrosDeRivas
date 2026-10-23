-- Permisos de tabla: las citas solo se leen (se crean y cambian con las funciones)
revoke all on public.appointment_providers, public.appointment_blocks, public.appointments from anon, authenticated;
grant select on public.appointment_providers to anon, authenticated;
grant insert, update, delete on public.appointment_providers to authenticated;
grant select, insert, delete on public.appointment_blocks to authenticated;
grant select on public.appointments to authenticated;
