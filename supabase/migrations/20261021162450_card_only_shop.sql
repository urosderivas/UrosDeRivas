-- La tienda solo se paga con tarjeta: los pedidos los crea únicamente la función
-- de pago (create-checkout-session), nunca el navegador. Se cierra la política
-- que dejaba a un usuario crear pedidos "para pagar en mano" (local_...).
-- Los pedidos antiguos siguen ahí y el admin los gestiona desde el panel.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders'
             and policyname = 'Users can insert own pending orders') then
    alter policy "Users can insert own pending orders" on public.orders
      rename to "Users cannot insert orders";
  end if;
end;
$$;
alter policy "Users cannot insert orders" on public.orders
  with check (false);
