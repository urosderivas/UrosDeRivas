-- Datos básicos de cada cuenta (nombre, apellidos y teléfono), que rellena el propio
-- usuario en "Mi cuenta" para que el club pueda contactarle por sus pedidos. El email
-- sigue siendo el del inicio de sesión (auth.users) y no se guarda aquí.
create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 60),
  last_name text not null default '' check (char_length(last_name) <= 100),
  -- Solo cifras y espacios, con + delante si lleva prefijo (la web lo limpia antes de guardar)
  phone text not null default '' check (phone = '' or phone ~ '^\+?[0-9 ]{6,20}$'),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

revoke all on public.user_profiles from anon, authenticated;
grant select, insert on public.user_profiles to authenticated;
grant update (first_name, last_name, phone) on public.user_profiles to authenticated;

-- Cada uno ve los suyos; el admin, los de todos; el resto del personal, solo los de quien
-- tiene algo con ellos (tienda: pedidos; entrenador: inscripciones; fisio: citas de su calendario).
create policy "Own profile or staff with a reason" on public.user_profiles
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.has_role(array['admin'])
    or (public.has_role(array['tienda'])
        and exists (select 1 from public.orders o where o.user_id = user_profiles.user_id))
    or (public.has_role(array['coach'])
        and exists (select 1 from public.event_registrations r where r.user_id = user_profiles.user_id))
    or (public.has_role(array['fisio'])
        and exists (select 1 from public.appointments a
                    where a.user_id = user_profiles.user_id and public.is_provider_staff(a.provider_id)))
  );

create policy "Users create their own profile" on public.user_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "Users edit their own profile" on public.user_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.touch_user_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_profiles_touch
  before update on public.user_profiles
  for each row execute function public.touch_user_profile();

revoke execute on function public.touch_user_profile() from public, anon, authenticated;
