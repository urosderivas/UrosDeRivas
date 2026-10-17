import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.33.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

let stripe: Stripe;

// Webs a las que Stripe puede redirigir tras el pago. Se configuran con el
// secreto ALLOWED_ORIGINS (orígenes separados por comas); estos son los de por defecto.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://migueltorresperez.github.io',
  'https://urosderivas.github.io',
  'http://localhost:5173',
];

const MAX_ATTENDEES = 20;
const MAX_ITEM_QUANTITY = 99;

function getAllowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS');
  if (!configured) return DEFAULT_ALLOWED_ORIGINS;
  return configured.split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
}

function validateReturnUrl(returnUrl: unknown): string {
  if (typeof returnUrl !== 'string') throw new Error("Missing returnUrl");
  let url: URL;
  try {
    url = new URL(returnUrl);
  } catch {
    throw new Error("Invalid returnUrl");
  }
  if (!getAllowedOrigins().includes(url.origin)) {
    throw new Error(`returnUrl origin not allowed: ${url.origin}`);
  }
  return `${url.origin}${url.pathname}`;
}

function isPositiveInt(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;
}

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

async function cancelCheckout(sessionId: unknown, userId: string, supabaseAdminClient: any): Promise<Response> {
  if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) throw new Error("Invalid session id");

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.userId !== userId) throw new Error("Forbidden");
  if (session.status === 'open') await stripe.checkout.sessions.expire(sessionId);
  if (session.status === 'complete') {
    return new Response(JSON.stringify({ cancelled: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  }

  // Lo mismo que hará el webhook con checkout.session.expired; solo filas pendientes
  const [ordersResult, registrationsResult] = await Promise.all([
    supabaseAdminClient.from('orders').update({ status: 'cancelled' })
      .eq('stripe_session_id', sessionId).eq('user_id', userId).eq('status', 'pending'),
    supabaseAdminClient.from('event_registrations').update({ status: 'cancelled' })
      .eq('stripe_session_id', sessionId).eq('user_id', userId).eq('status', 'pending'),
  ]);
  const dbError = ordersResult.error || registrationsResult.error;
  if (dbError) throw new Error("DB update failed: " + dbError.message);

  return new Response(JSON.stringify({ cancelled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
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

    // El usuario ha vuelto de Stripe con "cancelar": se cierra la sesión de pago
    // y sus pedidos o inscripciones pendientes pasan a cancelados al momento.
    if (body.cancelSessionId !== undefined) {
      return await cancelCheckout(body.cancelSessionId, user.id, supabaseAdminClient);
    }

    const { checkoutType, cartItems, userEmail, returnUrl, campusRegistration } = body;
    const isLocalReservation = checkoutType === 'campus' && campusRegistration?.payLocal === true;
    // Una reserva para pagar en mano no pasa por Stripe y no necesita URL de vuelta.
    const safeReturnUrl = isLocalReservation ? '' : validateReturnUrl(returnUrl);

    if (checkoutType === 'campus') {
      if (!campusRegistration) throw new Error("Missing campus registration data");
      
      // 1. Fetch Event securely from DB
      const { data: dbEvent, error: eventError } = await supabaseAdminClient
        .from('events')
        .select('title, active, dates, price_per_day, price_tiers, attendee_discounts')
        .eq('id', campusRegistration.eventId)
        .single();
        
      if (eventError || !dbEvent) {
        throw new Error(`Failed to securely fetch event constraints: ${eventError?.message}`);
      }
      if (dbEvent.active === false) throw new Error("Este campus ya no admite inscripciones.");

      // 2. Validate the registration against the event before pricing it
      const numAttendees = campusRegistration.numAttendees;
      if (!isPositiveInt(numAttendees, MAX_ATTENDEES)) {
        throw new Error(`El número de asistentes debe ser un entero entre 1 y ${MAX_ATTENDEES}.`);
      }

      const attendeeNames = campusRegistration.attendeeNames;
      if (
        !Array.isArray(attendeeNames) ||
        attendeeNames.length !== numAttendees ||
        attendeeNames.some((n: unknown) => typeof n !== 'string' || !n.trim())
      ) {
        throw new Error("Hace falta un nombre por cada asistente.");
      }

      const selectedDays = campusRegistration.selectedDays;
      const eventDays = new Set<string>(dbEvent.dates || []);
      if (
        !Array.isArray(selectedDays) ||
        selectedDays.length === 0 ||
        new Set(selectedDays).size !== selectedDays.length ||
        selectedDays.some((d: unknown) => typeof d !== 'string' || !eventDays.has(d))
      ) {
        throw new Error("Los días elegidos no coinciden con los del campus.");
      }

      const customData = campusRegistration.customData ?? {};
      if (
        typeof customData !== 'object' || Array.isArray(customData) ||
        Object.values(customData).some((v) => typeof v !== 'string')
      ) {
        throw new Error("Datos adicionales no válidos.");
      }

      // Una inscripción ya pagada no se puede volver a abrir desde aquí
      const { data: existing } = await supabaseAdminClient
        .from('event_registrations')
        .select('status')
        .eq('event_id', campusRegistration.eventId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing?.status === 'completed') throw new Error("Ya tienes una inscripción pagada en este campus.");

      // 3. Replicate the calcCampusPrice algorithm inside the Edge Function securely
      const numDays = selectedDays.length;
      
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
      
      const registration = {
        event_id: campusRegistration.eventId,
        user_id: user.id,
        selected_days: selectedDays,
        num_attendees: numAttendees,
        attendee_names: attendeeNames.map((n: string) => n.trim()),
        amount: safeTotalAmount, // [SECURE] Override with backend calculation
        status: 'pending',
        custom_data: customData
      };

      if (isLocalReservation) {
        const { error: insertError } = await supabaseAdminClient.from('event_registrations').upsert({
          ...registration,
          stripe_session_id: `local_${Date.now()}`
        }, { onConflict: 'event_id,user_id' });

        if (insertError) throw new Error("DB insert failed: " + insertError.message);

        return new Response(JSON.stringify({ reserved: true, amount: safeTotalAmount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      const finalPrice = Math.max(Math.round(safeTotalAmount * 100), 1);

      const line_items = [{
        price_data: {
          currency: 'eur',
          product_data: { 
            name: `Inscripción: ${dbEvent.title}`, 
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
        ...registration,
        stripe_session_id: session.id
      }, { onConflict: 'event_id,user_id' });

      if (insertError) throw new Error("DB insert failed: " + insertError.message);

      return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
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
      if (!isPositiveInt(cartItem.quantity, MAX_ITEM_QUANTITY)) {
        throw new Error(`La cantidad debe ser un entero entre 1 y ${MAX_ITEM_QUANTITY}.`);
      }

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

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
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
