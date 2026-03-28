import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.33.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let stripe: Stripe;

interface CartItemPayload {
  itemId: string;
  quantity: number;
  options?: Record<string, string>;
}

interface DbItem {
  id: string;
  name: string;
  price: number;
  image_url?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured.");
    
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

    if (authError || !user) throw new Error("Unauthorized: " + (authError?.message || "no user"));

    const body = await req.json();
    const { cartItems, userEmail, returnUrl } = body;

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error("Cart is empty");
    }

    // Fetch all required items from database securely
    const itemIds = (cartItems as CartItemPayload[]).map((c) => c.itemId);
    const { data: dbItems, error: itemsError } = await supabaseAdminClient
      .from('market_items')
      .select('*')
      .in('id', itemIds);

    if (itemsError || !dbItems) {
      throw new Error(`Failed to fetch items: ${itemsError?.message}`);
    }

    if (dbItems.length === 0) {
      throw new Error(`No items found for IDs: ${itemIds.join(', ')}`);
    }

    const dbItemsMap = new Map<string, DbItem>(dbItems.map((i: DbItem) => [i.id, i]));
    const origin = req.headers.get('origin') || 'https://migueltorresperez.github.io';
    const safeReturnUrl = returnUrl || `${origin}/UrosDeRivas/market`;

    const line_items: any[] = [];
    const orderInserts: any[] = [];

    // Validation & Stripe object construction
    for (const cartItem of cartItems as CartItemPayload[]) {
      const dbItem = dbItemsMap.get(cartItem.itemId);
      if (!dbItem) throw new Error(`Item ${cartItem.itemId} not found in database.`);

      const rawPrice = dbItem.price || 0;
      const finalPrice = Math.max(Math.round(rawPrice * 100), 1);
      
      const textOptionsList = Object.entries(cartItem.options || {}).map(([k,v]) => `${k}: ${v}`);
      const textOptionsStr = textOptionsList.join(' | ');

      // Only create Stripe line item for items with real prices
      if (rawPrice > 0) {
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
      }

      // DB order row — only columns that exist in the orders table schema:
      // id, user_id, buyer_name, buyer_email, item_id, size, status, amount, stripe_session_id, created_at
      orderInserts.push({
        user_id: user.id,
        buyer_name: user?.email?.split('@')[0] || 'Unknown',
        buyer_email: userEmail,
        item_id: dbItem.id,
        size: textOptionsStr || null,
        amount: rawPrice * cartItem.quantity,
        status: 'pending'
      });
    }

    // If ALL items are free, record orders directly without Stripe
    if (line_items.length === 0) {
      const freeSessionId = `free_${crypto.randomUUID().substring(0, 8)}`;
      for (const order of orderInserts) {
        order.stripe_session_id = freeSessionId;
      }
      const { error: insertError } = await supabaseAdminClient.from('orders').insert(orderInserts);
      if (insertError) {
        throw new Error("Error saving free order: " + insertError.message);
      }
      return new Response(JSON.stringify({ url: null, freeOrder: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
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
        cartSummary: `Cart: ${cartItems.length} items`
      }
    });

    // Attach stripe session ID to all orders
    for (const order of orderInserts) {
      order.stripe_session_id = session.id;
    }

    const { error: insertError } = await supabaseAdminClient.from('orders').insert(orderInserts);
    if (insertError) {
      throw new Error("DB insert failed: " + insertError.message);
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error("Edge Function Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
