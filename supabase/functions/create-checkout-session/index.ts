import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.33.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let stripe: Stripe;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("La clave secreta de Stripe no está configurada en la Edge Function.");
    
    if (!stripe) {
      stripe = new Stripe(stripeKey, {
        apiVersion: "2022-11-15",
        httpClient: Stripe.createFetchHttpClient(),
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) throw new Error("Unauthorized");

    const { itemId, userEmail, returnUrl } = await req.json();

    // Fetch the real price securely from DB to prevent frontend tampering
    const { data: item, error: itemError } = await supabaseClient
      .from('market_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      throw new Error(`Item not found: ${itemError?.message}`);
    }

    const origin = req.headers.get('origin') || 'https://migueltorresperez.github.io';
    // If the client sent their explicit browser window URL, we use it directly;
    // else we fallback to standard origin (which breaks in gh-pages subfolders).
    const safeReturnUrl = returnUrl || `${origin}/market`;

    // Initialize Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      customer_email: userEmail,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: item.name,
              images: (item.image_url && item.image_url.startsWith('http')) ? [item.image_url] : undefined,
            },
            unit_amount: Math.round(item.price * 100), // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${safeReturnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${safeReturnUrl}?canceled=true`,
      metadata: {
        userId: user.id,
        itemId: itemId,
      }
    });

    // Create a pending Order in our DB tracker logically linked to Stripe Session
    await supabaseClient.from('orders').insert({
      user_id: user.id,
      buyer_name: user.email?.split('@')[0] || 'Unknown',
      buyer_email: userEmail,
      item_id: itemId,
      amount: item.price,
      status: 'pending',
      stripe_session_id: session.id
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
