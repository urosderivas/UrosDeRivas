import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Stripe key not configured");

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2022-11-15",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const { sessionId, sessionIds } = await req.json();
    if (!sessionId && !sessionIds) throw new Error("sessionId or sessionIds required");

    // Bulk Mode
    if (sessionIds && Array.isArray(sessionIds)) {
      const results: Record<string, any> = {};
      // Chunk concurrent fetch to avoid hitting immediate Stripe rate limits (Stripe allows 100 req/s, we chunk by 20 to be safe)
      const chunkSize = 20;
      for (let i = 0; i < sessionIds.length; i += chunkSize) {
        const chunk = sessionIds.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (id) => {
          try {
            const s = await stripe.checkout.sessions.retrieve(id);
            results[id] = { payment_status: s.payment_status, status: s.status };
          } catch (err: any) {
            results[id] = { payment_status: 'error', error: err.message };
          }
        }));
      }
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // Single Mode (Legacy)
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return new Response(JSON.stringify({
      payment_status: session.payment_status, // 'paid' | 'unpaid' | 'no_payment_required'
      status: session.status, // 'complete' | 'expired' | 'open'
      customer_email: session.customer_details?.email,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
