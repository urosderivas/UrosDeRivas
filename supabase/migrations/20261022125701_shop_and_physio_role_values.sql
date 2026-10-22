-- Valores de rol permitidos: se añaden 'tienda' y 'fisio'.
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role = any (array['admin', 'coach', 'tienda', 'fisio', 'user']));
