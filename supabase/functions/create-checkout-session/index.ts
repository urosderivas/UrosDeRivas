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

    const supabaseAdminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Missing auth header");
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdminClient.auth.getUser(token);

    if (authError || !user) throw new Error("Unauthorized");

    const { cartItems, userEmail, returnUrl } = await req.json();

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error("Cart is empty");
    }

    // Fetch all required items from database securely
    const itemIds = cartItems.map((c: any) => c.itemId);
    const { data: dbItems, error: itemsError } = await supabaseAdminClient
      .from('market_items')
      .select('*')
      .in('id', itemIds);

    if (itemsError || !dbItems) {
      throw new Error(`Failed to fetch items: ${itemsError?.message}`);
    }

    const dbItemsMap = new Map(dbItems.map(i => [i.id, i]));
    const origin = req.headers.get('origin') || 'https://migueltorresperez.github.io';
    const safeReturnUrl = returnUrl || `${origin}/market`;

    const line_items: any[] = [];
    const orderInserts: any[] = [];

    // Validation & Stripe object construction
    for (const cartItem of cartItems) {
      const dbItem = dbItemsMap.get(cartItem.itemId);
      if (!dbItem) throw new Error(`Item ${cartItem.itemId} not found in database.`);

      const finalPrice = Math.round(dbItem.price * 100);
      const textOptionsList = Object.entries(cartItem.options || {}).map(([k,v]) => `${k}: ${v}`);
      const textOptionsStr = textOptionsList.join(' | ');

      line_items.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: dbItem.name,
            description: textOptionsStr || undefined,
            images: (dbItem.image_url && dbItem.image_url.startsWith('http')) ? [dbItem.image_url] : undefined,
          },
          unit_amount: finalPrice, 
        },
        quantity: cartItem.quantity,
      });

      // Prepare DB insert rows (Stripe session id will be injected after session creation)
      orderInserts.push({
        user_id: user.id,
        buyer_name: user?.email?.split('@')[0] || 'Unknown',
        buyer_email: userEmail,
        item_id: dbItem.id,
        item_name: dbItem.name,
        size: textOptionsStr || null, // Saving variables here seamlessly matching existing Admin Panel bindings
        amount: (finalPrice / 100) * cartItem.quantity,
        status: 'pending'
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer_email: userEmail,
      payment_method_types: ['card'],
      line_items: line_items,
      mode: 'payment',
      success_url: `${safeReturnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${safeReturnUrl}?canceled=true`,
      metadata: {
        userId: user.id,
        // Short metadata representation to avoid 500chars limit. The true metadata resides safely in Supabase `orders` table.
        cartSummary: `Cart with ${cartItems.length} configurations.`
      }
    });

    // Write all cart rows simultaneously sharing the exact same stripe_session_id natively bridging grouped UI tracking.
    for (const order of orderInserts) {
      order.stripe_session_id = session.id;
    }

    const { error: insertError } = await supabaseAdminClient.from('orders').insert(orderInserts);
    if (insertError) {
      console.error("Failed creating shadow orders in DB: ", insertError);
      throw new Error("Order creation failed locally before stripe redirect. Error: " + insertError.message);
    }

    return new Response(JSON.stringify({ url: session.url }), {
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
