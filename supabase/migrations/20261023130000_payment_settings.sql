-- Pago por transferencia: los datos de la cuenta del club, que el admin cambia desde
-- el panel. Hay una sola fila. Cualquiera puede leerla porque se enseña al comprar.
create table if not exists public.payment_settings (
  id boolean primary key default true check (id),
  iban text not null default '' check (length(iban) <= 50),
  holder text not null default '' check (length(holder) <= 120),
  -- Texto extra para el email y la web (p. ej. "Envía el justificante a ...")
  note text not null default '' check (length(note) <= 500),
  -- Días que tiene quien compra para hacer la transferencia (se le dice en la web y en el email)
  deadline_days integer not null default 3 check (deadline_days between 1 and 30),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.payment_settings (id) values (true) on conflict (id) do nothing;

alter table public.payment_settings enable row level security;

create policy "Anyone can read payment settings" on public.payment_settings
  for select using (true);

create policy "Admins can update payment settings" on public.payment_settings
  for update using (public.has_role(array['admin'])) with check (public.has_role(array['admin']));

revoke all on public.payment_settings from anon, authenticated;
grant select on public.payment_settings to anon, authenticated;
grant update (iban, holder, note, deadline_days, updated_at) on public.payment_settings to authenticated;
