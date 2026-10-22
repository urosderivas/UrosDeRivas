import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.33.1";
import { eventOptions, eventPrice, eventTable, isTournament, roundCents } from "../_shared/pricing.ts";

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
// Un pago sin terminar caduca a los 30 minutos (el mínimo de Stripe) y deja libre
// su plaza; sin esto Stripe lo mantiene abierto 24 horas.
const CHECKOUT_LIFETIME_SECONDS = 30 * 60;
const checkoutExpiresAt = () => Math.floor(Date.now() / 1000) + CHECKOUT_LIFETIME_SECONDS;

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
  sizes?: string[] | null;
  custom_fields?: { name: string; type: 'text' | 'categorical'; options?: string[]; required: boolean }[] | null;
  active?: boolean | null;
}

const MAX_CART_LINES = 50;
const MAX_OPTION_LENGTH = 100;
const MAX_NAME_LENGTH = 100;

type FormField = { name: string; type: 'text' | 'categorical'; options?: string[]; required: boolean };

/**
 * Comprueba lo que ha rellenado el usuario (talla, nombre del jugador...) contra los campos
 * definidos: solo campos que existen, valores de la lista en los de elegir, textos cortos
 * y los obligatorios puestos. Devuelve los valores limpios (sin los vacíos), en el orden
 * de los campos, o lanza un error en español. `changed` es el mensaje si llega un campo
 * que ya no existe (el producto o el evento se ha editado mientras tanto).
 */
function checkFields(fields: FormField[], raw: unknown, what: string, changed: string): Record<string, string> {
  if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) throw new Error("Datos no válidos.");
  const values = (raw || {}) as Record<string, unknown>;
  for (const key of Object.keys(values)) {
    if (!fields.some(f => f.name === key)) throw new Error(changed);
  }
  const clean: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (value != null && typeof value !== 'string') throw new Error(`"${field.name}" no es válido.`);
    const text = (value || '').trim();
    if (!text) {
      if (field.required) throw new Error(`Falta "${field.name}" en "${what}".`);
      continue;
    }
    if (text.length > MAX_OPTION_LENGTH) throw new Error(`"${field.name}" es demasiado largo (máximo ${MAX_OPTION_LENGTH} caracteres).`);
    if (field.type === 'categorical' && !(field.options || []).some(o => String(o).trim() === text)) {
      throw new Error(`"${text}" no es una opción de "${field.name}".`);
    }
    clean[field.name] = text;
  }
  return clean;
}

/** Opciones de un producto de la tienda, como texto para el pedido. */
function validateOptions(item: DbItem, raw: unknown): string {
  const fields: FormField[] = [...(item.custom_fields || [])];
  // Tallas antiguas (columna sizes) como campo "Talla" obligatorio, igual que en la web
  if (item.sizes?.length && !fields.some(f => f.name === 'Talla')) {
    fields.push({ name: 'Talla', type: 'categorical', options: item.sizes, required: true });
  }
  const values = checkFields(fields, raw, item.name, `Las opciones de "${item.name}" han cambiado: quítalo del carrito y vuelve a añadirlo.`);
  return Object.entries(values).map(([k, v]) => `${k}: ${v}`).join(' | ');
}

/** Clave de la inscripción de un jugador: su nombre sin mayúsculas, tildes ni espacios de más. */
function attendeeKey(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Código de cupón como lo guarda el panel: mayúsculas, sin espacios ni guiones. null si no hay. */
function couponCode(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw new Error("Cupón no válido.");
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  if (!code) return null;
  if (!/^[A-Z0-9]{4,20}$/.test(code)) throw new Error("Este cupón no existe o no es de este evento.");
  return code;
}

interface Coupon {
  id: string;
  code: string;
  price: number;
  stripe_session_id: string | null;
}

/**
 * Cupón del evento listo para usar, o un error. Un cupón apunta al último pago en el que
 * se usó: está gastado si ese pago se completó, y ocupado mientras siga abierto.
 * `owner` es quien se inscribe: si el pago abierto es de su misma inscripción (mismo
 * usuario y jugador), no cuenta como ocupado, porque al reintentar se cierra antes de
 * abrir el nuevo. Con `attendeeKey` null (solo consultar el precio) vale cualquier
 * inscripción del mismo usuario.
 */
async function findUsableCoupon(
  admin: any, eventId: string, code: string, owner: { userId: string; attendeeKey: string | null },
): Promise<Coupon> {
  const { data: coupon, error } = await admin
    .from('event_coupons')
    .select('id, code, price, stripe_session_id')
    .eq('event_id', eventId)
    .eq('code', code)
    .maybeSingle();
  if (error) throw new Error("No se pudo comprobar el cupón.");
  if (!coupon) throw new Error("Este cupón no existe o no es de este evento.");

  const sessionId: string | null = coupon.stripe_session_id;
  if (sessionId) {
    const { data: reg, error: regError } = await admin
      .from('event_registrations')
      .select('status, user_id, attendee_key')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();
    if (regError) throw new Error("No se pudo comprobar el cupón.");
    if (reg?.status === 'completed') throw new Error("Este cupón ya se ha usado.");
    const ownRetry = reg?.status === 'pending' && reg.user_id === owner.userId &&
      (owner.attendeeKey === null || reg.attendee_key === owner.attendeeKey);
    if (!ownRetry && sessionId.startsWith('cs_')) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.status === 'complete') throw new Error("Este cupón ya se ha usado.");
      if (session.status === 'open') {
        throw new Error("Este cupón se está usando en otro pago ahora mismo. Si es tuyo, termina o cancela ese pago, o espera media hora.");
      }
    }
  }
  return { id: coupon.id, code: coupon.code, price: Number(coupon.price), stripe_session_id: sessionId };
}

/**
 * Asigna el cupón a un pago nuevo solo si nadie lo ha cogido desde que se comprobó
 * (sigue apuntando al mismo pago de antes). false si otro pago se ha adelantado.
 */
async function claimCoupon(admin: any, coupon: Coupon, sessionId: string, userId: string): Promise<boolean> {
  let query = admin.from('event_coupons').update({ stripe_session_id: sessionId, user_id: userId }).eq('id', coupon.id);
  query = coupon.stripe_session_id ? query.eq('stripe_session_id', coupon.stripe_session_id) : query.is('stripe_session_id', null);
  const { data, error } = await query.select('id');
  return !error && Array.isArray(data) && data.length === 1;
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
  const [ordersResult, registrationsResult, appointmentsResult] = await Promise.all([
    supabaseAdminClient.from('orders').update({ status: 'cancelled' })
      .eq('stripe_session_id', sessionId).eq('user_id', userId).eq('status', 'pending'),
    supabaseAdminClient.from('event_registrations').update({ status: 'cancelled' })
      .eq('stripe_session_id', sessionId).eq('user_id', userId).eq('status', 'pending'),
    supabaseAdminClient.from('appointments').update({ status: 'cancelled', payment: 'failed' })
      .eq('stripe_session_id', sessionId).eq('user_id', userId).eq('payment', 'pending'),
  ]);
  const dbError = ordersResult.error || registrationsResult.error || appointmentsResult.error;
  if (dbError) throw new Error("DB update failed: " + dbError.message);

  return new Response(JSON.stringify({ cancelled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
}

const madridWhen = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

/**
 * Cita de fisio o recuperación de pago: se aparta el hueco (insert_user_appointment, que
 * comprueba que siga libre) y se abre el pago. El webhook la confirma o la cancela.
 */
async function appointmentCheckout(body: any, user: { id: string; email?: string }, admin: any): Promise<Response> {
  const appt = body.appointment;
  if (
    !appt || typeof appt.providerId !== 'string' || typeof appt.startsAt !== 'string' ||
    typeof appt.patientName !== 'string' || (appt.notes != null && typeof appt.notes !== 'string')
  ) {
    throw new Error("Datos de la cita no válidos.");
  }
  const safeReturnUrl = validateReturnUrl(body.returnUrl);

  // Un pago de cita a medias (otra pestaña, o volvió atrás sin cancelar) se cierra antes de
  // abrir otro, y su hueco queda libre; si ya se pagó, no se abre uno nuevo.
  const { data: open, error: openError } = await admin.from('appointments')
    .select('id, stripe_session_id')
    .eq('user_id', user.id).eq('payment', 'pending').eq('status', 'booked');
  if (openError) throw new Error("No se pudo comprobar tus citas.");
  for (const row of open || []) {
    if (typeof row.stripe_session_id === 'string' && row.stripe_session_id.startsWith('cs_')) {
      const previous = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
      if (previous.status === 'complete') {
        throw new Error("Tu pago anterior de una cita ya se ha completado. En unos segundos aparecerá en \"Mis citas\".");
      }
      if (previous.status === 'open') await stripe.checkout.sessions.expire(row.stripe_session_id);
    }
    await admin.from('appointments').update({ status: 'cancelled', payment: 'failed' }).eq('id', row.id).eq('payment', 'pending');
  }

  const { data: appointmentId, error: holdError } = await admin.rpc('insert_user_appointment', {
    p_user_id: user.id, p_provider_id: appt.providerId, p_starts_at: appt.startsAt,
    p_patient_name: appt.patientName, p_notes: appt.notes ?? null, p_pay: true,
  });
  if (holdError || !appointmentId) throw new Error(holdError?.message || "No se pudo reservar la cita.");

  const release = () => admin.from('appointments').update({ status: 'cancelled', payment: 'failed' })
    .eq('id', appointmentId).eq('payment', 'pending');
  try {
    const { data: row, error: rowError } = await admin.from('appointments')
      .select('amount, starts_at, patient_name, provider:appointment_providers(name, service)')
      .eq('id', appointmentId).single();
    if (rowError || !row) throw new Error("No se pudo preparar el pago de la cita.");
    const amount = roundCents(Number(row.amount));
    if (!Number.isFinite(amount) || amount < 0.5) throw new Error("El importe mínimo para pagar con tarjeta es 0,50 €.");

    const session = await stripe.checkout.sessions.create({
      customer_email: user.email || undefined,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Cita: ${row.provider.service} con ${row.provider.name}`,
            description: `${madridWhen.format(new Date(row.starts_at))} | ${row.patient_name}`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      expires_at: checkoutExpiresAt(),
      success_url: `${safeReturnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${safeReturnUrl}?canceled=true`,
      metadata: { userId: user.id, appointmentId, type: 'appointment' },
    });

    const { error: linkError } = await admin.from('appointments').update({ stripe_session_id: session.id }).eq('id', appointmentId);
    if (linkError) {
      await stripe.checkout.sessions.expire(session.id);
      throw new Error("No se pudo preparar el pago de la cita.");
    }
    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (err) {
    await release();
    throw err;
  }
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

    if (body.checkoutType === 'appointment') {
      return await appointmentCheckout(body, user, supabaseAdminClient);
    }

    const { checkoutType, cartItems, returnUrl, campusRegistration } = body;
    // El email es siempre el de la cuenta, no uno que mande el navegador
    const userEmail = user.email;

    // Precio de un cupón antes de pagar, para enseñarlo en el formulario
    if (body.checkCoupon !== undefined) {
      const eventId = body.checkCoupon?.eventId;
      const code = couponCode(body.checkCoupon?.code);
      if (typeof eventId !== 'string' || !code) throw new Error("Escribe el código del cupón.");
      const { data: ev } = await supabaseAdminClient.from('events').select('type, active').eq('id', eventId).maybeSingle();
      if (!ev || ev.active === false) throw new Error("Este evento ya no admite inscripciones.");
      if (!isTournament(ev)) throw new Error("Los cupones solo valen para torneos y viajes.");
      const coupon = await findUsableCoupon(supabaseAdminClient, eventId, code, { userId: user.id, attendeeKey: null });
      return new Response(JSON.stringify({ price: coupon.price }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // Inscripción a un campus, torneo o viaje (checkoutType 'campus' para todos los eventos)
    if (checkoutType === 'campus') {
      if (!campusRegistration) throw new Error("Missing campus registration data");
      // Ya no hay reservas para pagar en mano: todo se paga con tarjeta
      if (campusRegistration.payLocal === true) {
        throw new Error("El pago en mano ya no está disponible. Inscríbete pagando con tarjeta.");
      }
      const safeReturnUrl = validateReturnUrl(returnUrl);

      // 1. Fetch Event securely from DB
      const { data: dbEvent, error: eventError } = await supabaseAdminClient
        .from('events')
        .select('title, type, active, dates, price_per_day, price_tiers, attendee_discounts, price_table, price_options, custom_fields, max_capacity')
        .eq('id', campusRegistration.eventId)
        .single();
        
      if (eventError || !dbEvent) {
        throw new Error(`Failed to securely fetch event constraints: ${eventError?.message}`);
      }
      const tournament = isTournament(dbEvent);
      const eventNoun = tournament ? 'evento' : 'campus';
      if (dbEvent.active === false) throw new Error(`Este ${eventNoun} ya no admite inscripciones.`);

      // 2. Validate the registration against the event before pricing it
      const numAttendees = campusRegistration.numAttendees;
      if (!isPositiveInt(numAttendees, MAX_ATTENDEES)) {
        throw new Error(`El número de asistentes debe ser un entero entre 1 y ${MAX_ATTENDEES}.`);
      }
      // Torneos y viajes: cada inscripción es de un jugador, que paga su precio sin descuentos
      if (tournament && numAttendees !== 1) {
        throw new Error("En torneos y viajes se inscribe a un jugador cada vez.");
      }

      const attendeeNames = campusRegistration.attendeeNames;
      if (
        !Array.isArray(attendeeNames) ||
        attendeeNames.length !== numAttendees ||
        attendeeNames.some((n: unknown) => typeof n !== 'string' || !n.trim())
      ) {
        throw new Error("Hace falta un nombre por cada asistente.");
      }
      if (attendeeNames.some((n: string) => n.trim().length > MAX_NAME_LENGTH)) {
        throw new Error(`Cada nombre puede tener como mucho ${MAX_NAME_LENGTH} caracteres.`);
      }

      const selectedDays = campusRegistration.selectedDays;
      const eventDays = new Set<string>(dbEvent.dates || []);
      if (
        !Array.isArray(selectedDays) ||
        selectedDays.length === 0 ||
        new Set(selectedDays).size !== selectedDays.length ||
        selectedDays.some((d: unknown) => typeof d !== 'string' || !eventDays.has(d))
      ) {
        throw new Error(`Los días elegidos no coinciden con los del ${eventNoun}.`);
      }
      // Con precio por evento completo no se eligen días: se va a todos
      const table = eventTable(dbEvent);
      const options = eventOptions(dbEvent);
      // Una tabla o unas opciones rotas nunca deben acabar cobrando con el sistema anterior (o gratis)
      if (tournament ? !options : (dbEvent.price_table != null && !table)) {
        throw new Error("El precio de este evento no está bien configurado.");
      }
      if ((tournament || (table && !table.byDays)) && selectedDays.length !== eventDays.size) {
        throw new Error(`Este ${eventNoun} se paga completo: hay que inscribirse a todos sus días.`);
      }

      // Opción de precio elegida (p. ej. con o sin autobús); con una sola no hace falta elegir
      let option: { label: string; price: number } | null = null;
      if (tournament) {
        const index = options!.length === 1 ? (campusRegistration.priceOption ?? 0) : campusRegistration.priceOption;
        if (!Number.isInteger(index) || index < 0 || index >= options!.length) {
          throw new Error("Elige una de las opciones de precio.");
        }
        option = options![index];
      }

      const customData = checkFields(dbEvent.custom_fields || [], campusRegistration.customData, dbEvent.title,
        `El formulario de este ${eventNoun} ha cambiado: recarga la página y vuelve a rellenarlo.`);

      // En torneos cada jugador tiene su inscripción; en campus hay una por cuenta
      const key = tournament ? attendeeKey(attendeeNames[0]) : '';
      const code = couponCode(campusRegistration.coupon);
      if (code && !tournament) throw new Error("Los cupones solo valen para torneos y viajes.");

      // Una inscripción ya pagada no se puede volver a abrir desde aquí
      const { data: existing } = await supabaseAdminClient
        .from('event_registrations')
        .select('status, stripe_session_id')
        .eq('event_id', campusRegistration.eventId)
        .eq('user_id', user.id)
        .eq('attendee_key', key)
        .maybeSingle();
      if (existing?.status === 'completed') {
        throw new Error(tournament
          ? `${attendeeNames[0].trim()} ya está inscrito en este ${eventNoun}.`
          : `Ya tienes una inscripción pagada en este ${eventNoun}.`);
      }

      // El cupón se comprueba antes de tocar nada; se asigna al pago nuevo más abajo
      const coupon = code
        ? await findUsableCoupon(supabaseAdminClient, campusRegistration.eventId, code, { userId: user.id, attendeeKey: key })
        : null;

      // Si había un pago a medias (otra pestaña, o volvió atrás sin cancelar), se cierra
      // antes de abrir otro: si no, al pagar el antiguo no habría inscripción que confirmar.
      const previousSession = existing?.status === 'pending' ? existing.stripe_session_id : null;
      if (typeof previousSession === 'string' && previousSession.startsWith('cs_')) {
        const previous = await stripe.checkout.sessions.retrieve(previousSession);
        if (previous.status === 'complete') {
          throw new Error(`Tu pago anterior para este ${eventNoun} ya se ha completado. En unos minutos aparecerá como inscrito.`);
        }
        if (previous.status === 'open') await stripe.checkout.sessions.expire(previousSession);
      }

      // Aforo: cuentan las inscripciones no canceladas, menos la que se está rehaciendo
      if (dbEvent.max_capacity) {
        const { data: others, error: capacityError } = await supabaseAdminClient
          .from('event_registrations')
          .select('num_attendees, status, user_id, attendee_key')
          .eq('event_id', campusRegistration.eventId);
        if (capacityError) throw new Error(`No se pudo comprobar el aforo: ${capacityError.message}`);
        const taken = (others || [])
          .filter((r: any) => r.status !== 'cancelled' && !(r.user_id === user.id && r.attendee_key === key))
          .reduce((sum: number, r: any) => sum + (Number(r.num_attendees) || 0), 0);
        const left = Number(dbEvent.max_capacity) - taken;
        if (numAttendees > left) {
          if (left <= 0) throw new Error(`Este ${eventNoun} está completo.`);
          throw new Error(left === 1 ? `Solo queda 1 plaza en este ${eventNoun}.` : `Solo quedan ${left} plazas en este ${eventNoun}.`);
        }
      }

      // 3. Precio calculado aquí, nunca el que manda el navegador: el del cupón, el de la
      // opción del torneo o el de la tabla del campus (_shared/pricing.ts)
      const numDays = selectedDays.length;
      const safeTotalAmount = roundCents(
        coupon ? coupon.price : option ? option.price : eventPrice(dbEvent, numAttendees, numDays),
      );
      if (!Number.isFinite(safeTotalAmount) || safeTotalAmount < 0) throw new Error("El precio de este evento no está bien configurado.");

      // Lo elegido queda a la vista del club en la inscripción
      if (option?.label) customData['Opción de precio'] = option.label;
      if (coupon) customData['Cupón'] = coupon.code;

      const registration = {
        event_id: campusRegistration.eventId,
        user_id: user.id,
        attendee_key: key,
        selected_days: selectedDays,
        num_attendees: numAttendees,
        attendee_names: attendeeNames.map((n: string) => n.trim()),
        amount: safeTotalAmount, // [SECURE] Override with backend calculation
        status: 'pending',
        custom_data: customData
      };
      const couponTaken = () => new Error("Este cupón se acaba de usar en otro pago. Si crees que es un error, habla con el club.");

      // Gratis (evento gratis o cupón de 0 €): no hay nada que cobrar, la inscripción queda confirmada
      if (safeTotalAmount === 0) {
        const freeSessionId = `free_${crypto.randomUUID().substring(0, 8)}`;
        if (coupon && !(await claimCoupon(supabaseAdminClient, coupon, freeSessionId, user.id))) throw couponTaken();
        const { error: insertError } = await supabaseAdminClient.from('event_registrations').upsert({
          ...registration,
          status: 'completed',
          stripe_session_id: freeSessionId
        }, { onConflict: 'event_id,user_id,attendee_key' });

        if (insertError) throw new Error("DB insert failed: " + insertError.message);

        return new Response(JSON.stringify({ url: null, free: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
      }

      // Stripe no cobra menos de 0,50 €
      if (safeTotalAmount < 0.5) throw new Error("El importe mínimo para pagar con tarjeta es 0,50 €.");
      const finalPrice = Math.round(safeTotalAmount * 100);

      const detail = tournament
        ? [attendeeNames[0].trim(), option?.label, coupon ? `cupón ${coupon.code}` : ''].filter(Boolean).join(' | ')
        : table && !table.byDays
          ? `${numAttendees} asist. | evento completo`
          : `${numAttendees} asist. | ${numDays} ${numDays === 1 ? 'día' : 'días'}`;
      const line_items = [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Inscripción: ${dbEvent.title}`, description: detail },
          unit_amount: finalPrice,
        },
        quantity: 1,
      }];

      const session = await stripe.checkout.sessions.create({
        customer_email: userEmail || undefined,
        payment_method_types: ['card'],
        line_items,
        mode: 'payment',
        expires_at: checkoutExpiresAt(),
        success_url: `${safeReturnUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${safeReturnUrl}?canceled=true`,
        metadata: { userId: user.id, eventId: campusRegistration.eventId, type: 'campus' }
      });

      // Si otro pago se ha llevado el cupón mientras tanto, este no se puede usar
      if (coupon && !(await claimCoupon(supabaseAdminClient, coupon, session.id, user.id))) {
        await stripe.checkout.sessions.expire(session.id);
        throw couponTaken();
      }

      // Upsert registration as pending
      const { error: insertError } = await supabaseAdminClient.from('event_registrations').upsert({
        ...registration,
        stripe_session_id: session.id
      }, { onConflict: 'event_id,user_id,attendee_key' });

      if (insertError) throw new Error("DB insert failed: " + insertError.message);

      return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const safeReturnUrl = validateReturnUrl(returnUrl);
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      throw new Error("Cart is empty");
    }
    if (cartItems.length > MAX_CART_LINES) {
      throw new Error(`El carrito no puede tener más de ${MAX_CART_LINES} productos distintos.`);
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
      if (dbItem.active === false) {
        throw new Error(`"${dbItem.name}" ya no está a la venta. Quítalo del carrito para seguir.`);
      }
      if (!isPositiveInt(cartItem.quantity, MAX_ITEM_QUANTITY)) {
        throw new Error(`La cantidad debe ser un entero entre 1 y ${MAX_ITEM_QUANTITY}.`);
      }

      const rawPrice = dbItem.price || 0;
      const finalPrice = Math.max(Math.round(rawPrice * 100), 1);
      
      const textOptionsStr = validateOptions(dbItem, cartItem.options);

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
        buyer_email: userEmail || '',
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
      customer_email: userEmail || undefined,
      payment_method_types: ['card'],
      line_items: line_items,
      mode: 'payment',
      expires_at: checkoutExpiresAt(),
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
