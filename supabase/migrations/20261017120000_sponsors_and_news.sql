-- Patrocinadores y noticias gestionados desde la web (antes los patrocinadores
-- estaban escritos en Home.tsx). Las imágenes que se suban desde la web van al
-- bucket público "media" de Supabase Storage.

-- ============================================================
-- Patrocinadores
-- ============================================================

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- URL completa o ruta dentro de public/ (p. ej. assets/sponsors/logo.jpg)
  image_url text not null,
  link_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.sponsors enable row level security;

drop policy if exists "Anyone can read sponsors" on public.sponsors;
create policy "Anyone can read sponsors" on public.sponsors
  for select using (true);

drop policy if exists "Admins can insert sponsors" on public.sponsors;
create policy "Admins can insert sponsors" on public.sponsors
  for insert with check (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

drop policy if exists "Admins can update sponsors" on public.sponsors;
create policy "Admins can update sponsors" on public.sponsors
  for update using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

drop policy if exists "Admins can delete sponsors" on public.sponsors;
create policy "Admins can delete sponsors" on public.sponsors
  for delete using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

-- Los 23 patrocinadores que había en Home.tsx, con sus imágenes de public/assets/sponsors
insert into public.sponsors (name, image_url, link_url, sort_order)
select v.name, v.image_url, v.link_url, v.sort_order
from (values
  ('Everest Clínica Dental', 'assets/sponsors/everest.jpg', 'http://www.clinicadentaleverest.es/#content-content-inner', 1),
  ('Dominos Pizza', 'assets/sponsors/dominos-1-copy.jpg', 'https://www.dominospizza.es/', 2),
  ('Secomoto', 'assets/sponsors/Secomoto-1-copy.jpg', 'https://www.secomoto.com/', 3),
  ('Jarmauto', 'assets/sponsors/Compo-web-copy-300x250.jpg', 'https://www.jarmauto.es/', 4),
  ('Fisioterapia Watan', 'assets/sponsors/watan-copy-300x250.jpg', 'https://www.google.com/maps/place/Fisioterapia+Watan/@40.3540074', 5),
  ('Hospivet Rivas', 'assets/sponsors/Hospivet-1-300x250.jpg', 'http://www.hospivetrivas.es/', 6),
  ('Librería Números', 'assets/sponsors/Papeleria-Numeros-copy-300x250.jpg', 'https://www.google.com/maps/place/Librer%C3%ADa+NUMEROS/@40.3609267', 7),
  ('Altafit Gym', 'assets/sponsors/Altafit-300x250.jpg', 'https://altafitgymclub.com/gimnasios/madrid-rivas/', 8),
  ('Rotusil', 'assets/sponsors/rotusil_logo_web-300x160.png', 'http://rotusil.com/', 9),
  ('Asisa', 'assets/sponsors/asisa.jpg', 'https://www.asisa.es/seguros-de-salud', 10),
  ('Ferrual', 'assets/sponsors/Ferrual-300x250.jpg', 'http://www.ferrual.com/', 11),
  ('Academia Educatech', 'assets/sponsors/Educatech-copy-300x250.jpg', 'https://www.facebook.com/academiaeducatech/', 12),
  ('Atmosfera Sport', 'assets/sponsors/Atmosfera-300x150-300x250.jpg', 'https://www.atmosferasport.es', 13),
  ('AquaCare Rivas', 'assets/sponsors/AquaCare-300x150-300x250.jpg', 'https://www.aquacarerivas.com/', 14),
  ('Somos Fisioterapia', 'assets/sponsors/Somos-300x150-300x250.jpg', 'http://somosfisioterapiarivas.com/', 15),
  ('Mas q Manitas', 'assets/sponsors/Mas-q-manitas-300x150-300x250.jpg', 'http://www.masqmanitas.es/paginas/introduccion.html', 16),
  ('Centro Estudios Moyra', 'assets/sponsors/moyra-300x150-300x250.jpg', 'https://www.centroestudiosmoyra.es/', 17),
  ('Dra. Ana Lucia Picco', 'assets/sponsors/Picco-300x150-300x250.jpg', 'https://www.doctoraanaluciapiccolaskowski.es/es/', 18),
  ('Librería Rubén', 'assets/sponsors/Ruben-300x150-300x250.jpg', 'http://www.libreriaruben.com/', 19),
  ('Fast Motor', 'assets/sponsors/Fast-300x150-300x250.jpg', 'http://fastmotor.cuidamostucoche.com/', 20),
  ('Academia Naranjo', 'assets/sponsors/Academia-Nar-300x150-300x250.jpg', 'https://www.google.com/maps/place/Academia+Naranjo/@40.3256751,-3.5164271', 21),
  ('Autoescuela Universal', 'assets/sponsors/Universal-300x150-300x250.jpg', 'https://www.google.com/maps/place/Autoescuela+Universal/@40.3291921,-3.5120691', 22),
  ('Odontólogos Rivas', 'assets/sponsors/Especialidades-300x150-300x250.jpg', 'https://www.odontologosrivas.com/', 23)
) as v(name, image_url, link_url, sort_order)
where not exists (select 1 from public.sponsors);

-- ============================================================
-- Noticias
-- ============================================================

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- Texto plano; los enlaces se escriben como [texto](https://...)
  body text not null default '',
  image_url text,
  -- Campus relacionado (opcional): la noticia muestra un botón para ir a él
  event_id uuid references public.events(id) on delete set null,
  published_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.news enable row level security;

drop policy if exists "Anyone can read news" on public.news;
create policy "Anyone can read news" on public.news
  for select using (true);

drop policy if exists "Admins can insert news" on public.news;
create policy "Admins can insert news" on public.news
  for insert with check (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

drop policy if exists "Admins can update news" on public.news;
create policy "Admins can update news" on public.news
  for update using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

drop policy if exists "Admins can delete news" on public.news;
create policy "Admins can delete news" on public.news
  for delete using (
    exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

-- ============================================================
-- Imágenes: bucket público "media" (1 GB gratis en el plan Free)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "Admins can upload media" on storage.objects;
create policy "Admins can upload media" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'media'
    and exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

drop policy if exists "Admins can update media" on storage.objects;
create policy "Admins can update media" on storage.objects
  for update to authenticated using (
    bucket_id = 'media'
    and exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );

drop policy if exists "Admins can delete media" on storage.objects;
create policy "Admins can delete media" on storage.objects
  for delete to authenticated using (
    bucket_id = 'media'
    and exists (select 1 from public.user_roles where user_roles.user_id = auth.uid() and user_roles.role = 'admin')
  );
