-- Quita a los visitantes sin sesión (rol anon) el permiso de llamar a las
-- funciones security definer por /rest/v1/rpc. Ya comprobaban el rol por
-- dentro, pero así ni siquiera se ejecutan sin login.

-- Funciones de la web: solo usuarios con sesión (dentro se exige admin o coach)
revoke execute on function public.get_system_users() from public, anon;
revoke execute on function public.delete_user_account(uuid) from public, anon;
revoke execute on function public.delete_admin_order(uuid) from public, anon;
revoke execute on function public.get_event_registrations(uuid) from public, anon;
revoke execute on function public.update_admin_campus_status(uuid, uuid, text) from public, anon;

-- Funciones de trigger: nadie tiene que llamarlas por la API
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- rls_auto_enable solo existe en producción (lo creó Supabase)
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
