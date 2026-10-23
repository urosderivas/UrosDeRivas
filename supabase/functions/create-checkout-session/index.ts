import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.33.1";
import { eventOptions, eventTable, isTournament, registrationPrice, roundCents } from "../_shared/pricing.ts";
import { formatEuros, sendMail, transferMail } from "../_shared/mail.ts";

// Crea los pedidos de la tienda, las inscripciones a campus, torneos y viajes y las citas
// de pago. Se paga por transferencia: todo queda pendiente con un concepto único
// (p. ej. UROS-4F7K2Q, guardado en stripe_session_id, que antes era la sesión de Stripe),
// se devuelven los datos de la cuenta del club y se mandan también por email.
// El club lo marca como pagado desde el panel cuando le llega la transferencia.
// Lo gratis queda confirmado al momento.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

const MAX_ATTENDEES = 20;
const MAX_ITEM_QUANTITY = 99;

// Sin letras ni números que se confundan (O/0, I/1)
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Concepto de la transferencia: UROS- y 6 caracteres al azar. */
function newReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'UROS-' + Array.from(bytes, b => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join('');
}

const isTransferReference = (ref: unknown): ref is string => typeof ref === 'string' && ref.startsWith('UROS-');

interface PaymentSettings { iban: string; holder: string; note: string; deadlineDays: number }

/** Datos de la cuenta del club; sin IBAN no se puede vender nada de pago. */
async function paymentSettings(admin: any): Promise<PaymentSettings> {
  const { data, error } = await admin.from('payment_settings').select('iban, holder, note, deadline_days').maybeSingle();
  if (error) throw new Error("No se pudieron leer los datos de pago del club.");
  if (!data?.iban?.trim()) {
    throw new Error("El club todavía no ha puesto su número de cuenta para las transferencias. Inténtalo más tarde.");
  }
  return {
    iban: data.iban.trim(), holder: (data.holder || '').trim(), note: (data.note || '').trim(),
    deadlineDays: data.deadline_days || 3,
  };
}

/**
 * Respuesta de una compra o reserva por transferencia: los datos para pagar, que la
 * web enseña, y el aviso de si se ha mandado el email con ellos.
 */
async function transferResponse(
  email: string | undefined, reference: string, amount: number, items: string[], settings: PaymentSettings,
): Promise<Response> {
  const emailSent = email
    ? await sendMail(transferMail(email, { items, amount, reference, ...settings }))
    : false;
  return json({ transfer: { reference, amount, ...settings }, emailSent });
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
 * Cupón del evento listo para usar, o un error. Un cupón apunta a la última inscripción
 * en la que se usó (por su concepto): está gastado si esa inscripción está pagada, y
 * reservado mientras espere su transferencia. `owner` es quien se inscribe; con
 * `attendeeKey` null (solo consultar el precio) vale cualquier inscripción del mismo usuario.
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

  const ref: string | null = coupon.stripe_session_id;
  if (ref) {
    const { data: reg, error: regError } = await admin
      .from('event_registrations')
      .select('status, user_id, attendee_key')
      .eq('stripe_session_id', ref)
      .maybeSingle();
    if (regError) throw new Error("No se pudo comprobar el cupón.");
    if (reg?.status === 'completed') throw new Error("Este cupón ya se ha usado.");
    // Los pagos con tarjeta antiguos que quedaron a medias ya caducaron: no cuentan
    const own = reg?.user_id === owner.userId && (owner.attendeeKey === null || reg.attendee_key === owner.attendeeKey);
    if (reg?.status === 'pending' && isTransferReference(ref) && !own) {
      throw new Error("Este cupón ya está reservado en otra inscripción. Si crees que es un error, habla con el club.");
    }
  }
  return { id: coupon.id, code: coupon.code, price: Number(coupon.price), stripe_session_id: ref };
}

/**
 * Asigna el cupón a una inscripción nueva solo si nadie lo ha cogido desde que se comprobó
 * (sigue apuntando a la misma de antes). false si otra se ha adelantado.
 */
async function claimCoupon(admin: any, coupon: Coupon, reference: string, userId: string): Promise<boolean> {
  let query = admin.from('event_coupons').update({ stripe_session_id: reference, user_id: userId }).eq('id', coupon.id);
  query = coupon.stripe_session_id ? query.eq('stripe_session_id', coupon.stripe_session_id) : query.is('stripe_session_id', null);
  const { data, error } = await query.select('id');
  return !error && Array.isArray(data) && data.length === 1;
}

/** Error al guardar la inscripción: el del aforo (lo lanza la base de datos) se enseña tal cual. */
function registrationError(error: { code?: string; message: string }): Error {
  return new Error(error.code === 'P0001' ? error.message : "DB insert failed: " + error.message);
}

const madridWhen = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
});

/** Cita de pago: se aparta el hueco (insert_user_appointment, que comprueba que siga libre) hasta que llegue la transferencia. */
async function appointmentCheckout(body: any, user: { id: string; email?: string }, admin: any): Promise<Response> {
  const appt = body.appointment;
  if (
    !appt || typeof appt.providerId !== 'string' || typeof appt.startsAt !== 'string' ||
    typeof appt.patientName !== 'string' || (appt.notes != null && typeof appt.notes !== 'string')
  ) {
    throw new Error("Datos de la cita no válidos.");
  }
  const settings = await paymentSettings(admin);

  const { data: appointmentId, error: holdError } = await admin.rpc('insert_user_appointment', {
    p_user_id: user.id, p_provider_id: appt.providerId, p_starts_at: appt.startsAt,
    p_patient_name: appt.patientName, p_notes: appt.notes ?? null, p_pay: true,
  });
  if (holdError || !appointmentId) throw new Error(holdError?.message || "No se pudo reservar la cita.");

  const reference = newReference();
  const { data: row, error: rowError } = await admin.from('appointments')
    .update({ stripe_session_id: reference })
    .eq('id', appointmentId)
    .select('amount, starts_at, patient_name, provider:appointment_providers(name, service)')
    .single();
  if (rowError || !row) {
    await admin.from('appointments').update({ status: 'cancelled', payment: 'failed' }).eq('id', appointmentId).eq('payment', 'pending');
    throw new Error("No se pudo preparar la cita.");
  }
  const amount = roundCents(Number(row.amount));
  const item = `Cita: ${row.provider.service} con ${row.provider.name}, ${madridWhen.format(new Date(row.starts_at))} (${row.patient_name})`;
  return await transferResponse(user.email, reference, amount, [item], settings);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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

    if (body.checkoutType === 'appointment') {
      return await appointmentCheckout(body, user, supabaseAdminClient);
    }

    const { checkoutType, cartItems, campusRegistration } = body;
    // El email es siempre el de la cuenta, no uno que mande el navegador
    const userEmail = user.email;

    // Precio de un cupón antes de inscribirse, para enseñarlo en el formulario
    if (body.checkCoupon !== undefined) {
      const eventId = body.checkCoupon?.eventId;
      const code = couponCode(body.checkCoupon?.code);
      if (typeof eventId !== 'string' || !code) throw new Error("Escribe el código del cupón.");
      const { data: ev } = await supabaseAdminClient.from('events').select('type, active').eq('id', eventId).maybeSingle();
      if (!ev || ev.active === false) throw new Error("Este evento ya no admite inscripciones.");
      if (!isTournament(ev)) throw new Error("Los cupones solo valen para torneos y viajes.");
      const coupon = await findUsableCoupon(supabaseAdminClient, eventId, code, { userId: user.id, attendeeKey: null });
      return json({ price: coupon.price });
    }

    // Inscripción a un campus, torneo o viaje (checkoutType 'campus' para todos los eventos)
    if (checkoutType === 'campus') {
      if (!campusRegistration) throw new Error("Missing campus registration data");

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

      const table = eventTable(dbEvent);
      const options = eventOptions(dbEvent);
      // Una tabla o unas opciones rotas nunca deben acabar cobrando con el sistema anterior (o gratis)
      if (tournament ? !options : (dbEvent.price_table != null && !table)) {
        throw new Error("El precio de este evento no está bien configurado.");
      }

      // Días de cada asistente. Con precio por evento completo (y en torneos) se va a todos.
      const eventDates: string[] = [...(dbEvent.dates || [])].sort();
      const eventDays = new Set<string>(eventDates);
      const wholeEvent = tournament || (table !== null && !table.byDays);
      // Una web abierta antes de este cambio manda selectedDays: los mismos días para todos
      const rawDays = Array.isArray(campusRegistration.attendeeDays)
        ? campusRegistration.attendeeDays
        : Array.from({ length: numAttendees }, () => campusRegistration.selectedDays);
      if (rawDays.length !== numAttendees) throw new Error("Faltan los días de algún asistente.");
      const attendeeDays: string[][] = rawDays.map((days: unknown, i: number) => {
        const who = attendeeNames[i].trim();
        if (
          !Array.isArray(days) || days.length === 0 ||
          new Set(days).size !== days.length ||
          days.some((d: unknown) => typeof d !== 'string' || !eventDays.has(d))
        ) {
          throw new Error(`Los días elegidos para ${who} no coinciden con los del ${eventNoun}.`);
        }
        if (wholeEvent && days.length !== eventDays.size) {
          throw new Error(`Este ${eventNoun} se paga completo: hay que inscribirse a todos sus días.`);
        }
        return [...days as string[]].sort();
      });
      const selectedDays = eventDates.filter(d => attendeeDays.some(days => days.includes(d)));

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

      // Una inscripción pagada, o esperando su transferencia, no se rehace desde aquí:
      // si ya se hubiera transferido con el concepto anterior, el club no la encontraría.
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
      if (existing?.status === 'pending' && isTransferReference(existing.stripe_session_id)) {
        throw new Error(`${tournament ? `${attendeeNames[0].trim()} ya tiene` : 'Ya tienes'} una inscripción en este ${eventNoun} esperando la transferencia (concepto ${existing.stripe_session_id}). Si quieres cambiarla, habla con el club.`);
      }

      // El cupón se comprueba antes de tocar nada; se asigna a la inscripción más abajo
      const coupon = code
        ? await findUsableCoupon(supabaseAdminClient, campusRegistration.eventId, code, { userId: user.id, attendeeKey: key })
        : null;

      // 3. Precio calculado aquí, nunca el que manda el navegador: el del cupón, el de la
      // opción del torneo o el de la tabla del campus (_shared/pricing.ts)
      const safeTotalAmount = roundCents(
        coupon ? coupon.price : option ? option.price : registrationPrice(dbEvent, attendeeDays.map(d => d.length)),
      );
      if (!Number.isFinite(safeTotalAmount) || safeTotalAmount < 0) throw new Error("El precio de este evento no está bien configurado.");

      // Lo elegido queda a la vista del club en la inscripción
      if (option?.label) customData['Opción de precio'] = option.label;
      if (coupon) customData['Cupón'] = coupon.code;

      const free = safeTotalAmount === 0;
      const settings = free ? null : await paymentSettings(supabaseAdminClient);
      const reference = free ? `free_${crypto.randomUUID().substring(0, 8)}` : newReference();

      const couponTaken = () => new Error("Este cupón se acaba de usar en otra inscripción. Si crees que es un error, habla con el club.");
      if (coupon && !(await claimCoupon(supabaseAdminClient, coupon, reference, user.id))) throw couponTaken();

      // El aforo lo comprueba la base de datos al guardar (cuentan también las pendientes de pago)
      const { error: insertError } = await supabaseAdminClient.from('event_registrations').upsert({
        event_id: campusRegistration.eventId,
        user_id: user.id,
        attendee_key: key,
        selected_days: selectedDays,
        attendee_days: attendeeDays,
        num_attendees: numAttendees,
        attendee_names: attendeeNames.map((n: string) => n.trim()),
        amount: safeTotalAmount, // [SECURE] Override with backend calculation
        // Gratis (evento gratis o cupón de 0 €): no hay nada que pagar, queda confirmada
        status: free ? 'completed' : 'pending',
        stripe_session_id: reference,
        custom_data: customData,
      }, { onConflict: 'event_id,user_id,attendee_key' });
      if (insertError) throw registrationError(insertError);

      if (free) return json({ free: true });

      const who = tournament
        ? [attendeeNames[0].trim(), option?.label].filter(Boolean).join(', ')
        : attendeeNames.map((n: string, i: number) => wholeEvent ? n.trim() : `${n.trim()} (${attendeeDays[i].length} ${attendeeDays[i].length === 1 ? 'día' : 'días'})`).join(', ');
      return await transferResponse(userEmail, reference, safeTotalAmount, [`Inscripción a ${dbEvent.title}: ${who}`], settings!);
    }

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

    const orderInserts: any[] = [];
    const lines: string[] = [];

    for (const cartItem of cartItems as CartItemPayload[]) {
      const dbItem = dbItemsMap.get(cartItem.itemId);
      if (!dbItem) throw new Error(`Item ${cartItem.itemId} not found in database.`);
      if (dbItem.active === false) {
        throw new Error(`"${dbItem.name}" ya no está a la venta. Quítalo del carrito para seguir.`);
      }
      if (!isPositiveInt(cartItem.quantity, MAX_ITEM_QUANTITY)) {
        throw new Error(`La cantidad debe ser un entero entre 1 y ${MAX_ITEM_QUANTITY}.`);
      }

      const price = Math.max(Number(dbItem.price) || 0, 0);
      const textOptionsStr = validateOptions(dbItem, cartItem.options);
      const amount = roundCents(price * cartItem.quantity);
      lines.push(`${cartItem.quantity} x ${dbItem.name}${textOptionsStr ? ` (${textOptionsStr})` : ''}: ${formatEuros(amount)}`);

      // DB order row — only columns that exist in the orders table schema
      orderInserts.push({
        user_id: user.id,
        buyer_name: user?.email?.split('@')[0] || 'Unknown',
        buyer_email: userEmail || '',
        item_id: dbItem.id,
        size: textOptionsStr || null,
        quantity: cartItem.quantity,
        amount,
        status: 'pending'
      });
    }

    const total = roundCents(orderInserts.reduce((sum, o) => sum + o.amount, 0));
    // Todo gratis: no hay nada que pagar; el pedido queda listo para entregar
    const free = total === 0;
    const settings = free ? null : await paymentSettings(supabaseAdminClient);
    const reference = free ? `free_${crypto.randomUUID().substring(0, 8)}` : newReference();
    for (const order of orderInserts) {
      order.stripe_session_id = reference;
      if (free) order.status = 'processing';
    }

    const { error: insertError } = await supabaseAdminClient.from('orders').insert(orderInserts);
    if (insertError) {
      throw new Error("DB insert failed: " + insertError.message);
    }

    if (free) return json({ free: true });
    return await transferResponse(userEmail, reference, total, lines, settings!);
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
