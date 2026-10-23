-- Roles nuevos y asignación de roles desde el panel.
--
-- - 'tienda': gestiona el catálogo, las fotos de los productos y los pedidos (nada más).
-- - 'fisio': fisioterapeuta o recuperador; gestiona su calendario de citas
--   (tablas en 20261022125858_appointments.sql y siguientes).
-- - set_user_role: un admin cambia el rol de otro usuario sin SQL. Nadie cambia el suyo,
--   para que un admin no se quede fuera por error.
-- Borrar pedidos sigue siendo solo de admins (delete_admin_order no cambia).

-- ¿Tiene el usuario actual alguno de estos roles? (para políticas y funciones)
create or replace function public.has_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = any (roles)
  );
$$;

-- También para visitantes sin sesión: las políticas la evalúan con ellos (siempre false)
grant execute on function public.has_role(text[]) to anon, authenticated;

create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.has_role(array['admin']) then
    raise exception 'Solo un administrador puede cambiar roles.';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol. Pídeselo a otro administrador.';
  end if;
  if new_role is null or new_role not in ('admin', 'coach', 'tienda', 'fisio', 'user') then
    raise exception 'Rol no válido.';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'Ese usuario no existe.';
  end if;

  insert into user_roles (user_id, role) values (target_user_id, new_role)
  on conflict (user_id) do update set role = excluded.role;
end;
$function$;

revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- Tienda: catálogo
alter policy "Admins can insert market items" on public.market_items
  with check (public.has_role(array['admin', 'tienda']));
alter policy "Admins can update market items" on public.market_items
  using (public.has_role(array['admin', 'tienda']));
alter policy "Admins can delete market items" on public.market_items
  using (public.has_role(array['admin', 'tienda']));

-- Tienda: pedidos (ver y cambiar el estado; crearlos sigue siendo cosa de la función de pago)
alter policy "Admins can read all orders" on public.orders
  using (public.has_role(array['admin', 'tienda']));
alter policy "Admins can update orders" on public.orders
  using (public.has_role(array['admin', 'tienda']));

-- Tienda: fotos de los productos (mismo bucket que noticias y patrocinadores, pero
-- el gestor de la tienda solo toca la carpeta products/)
alter policy "Admins can upload media" on storage.objects
  with check (bucket_id = 'media' and (public.has_role(array['admin'])
    or (public.has_role(array['tienda']) and name like 'products/%')));
alter policy "Admins can update media" on storage.objects
  using (bucket_id = 'media' and (public.has_role(array['admin'])
    or (public.has_role(array['tienda']) and name like 'products/%')));
alter policy "Admins can delete media" on storage.objects
  using (bucket_id = 'media' and (public.has_role(array['admin'])
    or (public.has_role(array['tienda']) and name like 'products/%')));
