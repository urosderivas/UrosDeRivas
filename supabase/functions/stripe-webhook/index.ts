import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.33.1";

// Recibe los avisos de Stripe y actualiza pedidos, inscripciones y citas sin esperar
// a que un admin pulse "sincronizar". Stripe la llama directamente, así que
// no lleva JWT de Supabase: la seguridad es la firma del webhook (whsec_...).

const cryptoProvider = Stripe.createSubtleCryptoProvider();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeKey || !webhookSecret) {
    console.error("STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET not configured");
    return json({ error: 'Webhook not configured' }, 500);
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2022-11-15",
    httpClient: Stripe.createFetchHttpClient(),
  });

  const signature = req.headers.get('Stripe-Signature');
  if (!signature) return json({ error: 'Missing signature' }, 400);

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err: any) {
    console.error("Invalid webhook signature:", err.message);
    return json({ error: 'Invalid signature' }, 400);
  }

  let outcome: 'paid' | 'failed' | null = null;
  const session = event.data.object as Stripe.Checkout.Session;

  switch (event.type) {
    case 'checkout.session.completed':
      // Con tarjeta llega ya pagado; los métodos asíncronos avisan después
      if (session.payment_status === 'paid') outcome = 'paid';
      break;
    case 'checkout.session.async_payment_succeeded':
      outcome = 'paid';
      break;
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      outcome = 'failed';
      break;
  }

  if (!outcome) return json({ received: true, ignored: event.type });

  // Mismos estados que pone la sincronización del panel de admin: un pedido
  // pagado pasa a "processing" (falta entregarlo) y una inscripción a "completed".
  const orderStatus = outcome === 'paid' ? 'processing' : 'cancelled';
  const registrationStatus = outcome === 'paid' ? 'completed' : 'cancelled';

  const supabaseAdminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Solo se tocan filas pendientes, para no pisar lo que haya cambiado un admin.
  // Una cita pagada sigue reservada; una sin pagar se cancela y su hueco queda libre.
  const [ordersResult, registrationsResult, appointmentsResult] = await Promise.all([
    supabaseAdminClient.from('orders')
      .update({ status: orderStatus })
      .eq('stripe_session_id', session.id)
      .eq('status', 'pending'),
    supabaseAdminClient.from('event_registrations')
      .update({ status: registrationStatus })
      .eq('stripe_session_id', session.id)
      .eq('status', 'pending'),
    supabaseAdminClient.from('appointments')
      .update(outcome === 'paid' ? { payment: 'paid' } : { payment: 'failed', status: 'cancelled' })
      .eq('stripe_session_id', session.id)
      .eq('payment', 'pending'),
  ]);

  const dbError = ordersResult.error || registrationsResult.error || appointmentsResult.error;
  if (dbError) {
    // Un 500 hace que Stripe reintente el aviso más tarde
    console.error("DB update failed:", dbError.message);
    return json({ error: 'DB update failed' }, 500);
  }

  return json({ received: true, outcome });
});
