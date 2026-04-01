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
    const { checkoutType, cartItems, userEmail, returnUrl, campusRegistration } = body;
    const origin = req.headers.get('origin') || 'https://migueltorresperez.github.io';
    const safeReturnUrl = returnUrl || `${origin}/UrosDeRivas/market`;

    if (checkoutType === 'campus') {
      if (!campusRegistration) throw new Error("Missing campus registration data");
      
      // 1. Fetch Event securely from DB
      const { data: dbEvent, error: eventError } = await supabaseAdminClient
        .from('events')
        .select('price_per_day, price_tiers, attendee_discounts')
        .eq('id', campusRegistration.eventId)
        .single();
        
      if (eventError || !dbEvent) {
        throw new Error(`Failed to securely fetch event constraints: ${eventError?.message}`);
      }

      // 2. Replicate the calcCampusPrice algorithm inside the Edge Function securely
      const numDays = Array.isArray(campusRegistration.selectedDays) ? campusRegistration.selectedDays.length : 0;
      const numAttendees = Number(campusRegistration.numAttendees) || 1;
      
      let safePricePerDay = Number(dbEvent.price_per_day) || 0;
      const sortedTiers = [...(dbEvent.price_tiers || [])].sort((a: any, b: any) => b.minDays - a.minDays);
      for (const tier of sortedTiers) {
        if (numDays >= tier.minDays) { 
          safePricePerDay = Number(tier.pricePerDay); 
          break; 
        }
      }

      const subtotal = safePricePerDay * numDays * numAttendees;

      let discountPct = 0;
      const sortedDiscounts = [...(dbEvent.attendee_discounts || [])].sort((a: any, b: any) => b.minAttendees - a.minAttendees);
      for (const d of sortedDiscounts) {
        if (numAttendees >= d.minAttendees) { 
          discountPct = Number(d.discountPct); 
          break; 
        }
      }

      const discount = subtotal * (discountPct / 100);
      const safeTotalAmount = subtotal - discount;
      
      const finalPrice = Math.max(Math.round(safeTotalAmount * 100), 1);

      const line_items = [{
        price_data: {
          currency: 'eur',
          product_data: { 
            name: `Inscripción: ${campusRegistration.title}`, 
            description: `${numAttendees} asist. | ${numDays} días`
          },
          unit_amount: finalPrice,
        },
        quantity: 1,
      }];

      const session = await stripe.checkout.sessions.create({
        customer_email: userEmail || undefined,
        payment_method_types: ['card'],
        line_items,
        mode: 'payment',
        success_url: `${safeReturnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${safeReturnUrl}?canceled=true`,
        metadata: { userId: user.id, eventId: campusRegistration.eventId, type: 'campus' }
      });

      // Upsert registration as pending
      const { error: insertError } = await supabaseAdminClient.from('event_registrations').upsert({
        event_id: campusRegistration.eventId,
        user_id: user.id,
        selected_days: campusRegistration.selectedDays,
        num_attendees: numAttendees,
        attendee_names: campusRegistration.attendeeNames,
        amount: safeTotalAmount, // [SECURE] Override with backend calculation
        status: 'pending',
        stripe_session_id: session.id,
        custom_data: campusRegistration.customData
      }, { onConflict: 'event_id,user_id' });

      if (insertError) throw new Error("DB insert failed: " + insertError.message);

      return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

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

      // DB order row — only columns that exist in the orders table schema
      orderInserts.push({
        user_id: user.id,
        buyer_name: user?.email?.split('@')[0] || 'Unknown',
        buyer_email: userEmail,
        item_id: dbItem.id,
        size: textOptionsStr || null,
        quantity: cartItem.quantity,
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
    console.error("Edge Function Exception:", error);
    // Return a 400 status with JSON so the frontend `invoke` parser can read the exact error message
    // If it returns 500 or throws, Supabase hides the message and sets it to "Edge Function returned a non-2xx status code"
    return new Response(JSON.stringify({ error: error.message || 'Unknown error in edge function' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
