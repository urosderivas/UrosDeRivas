-- Noticias ocultables, como campus y productos: los usuarios solo leen las
-- visibles; los admins las ven todas para poder editarlas y volver a mostrarlas.
alter table public.news add column if not exists active boolean not null default true;

alter policy "Anyone can read news" on public.news
  using (active or public.has_role(array['admin']));
