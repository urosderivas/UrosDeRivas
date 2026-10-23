import { supabase } from '../utils/supabase';

/** Datos de la cuenta del club para las transferencias (los cambia el admin en el panel). */
export interface PaymentSettings {
  iban: string;
  holder: string;
  /** Texto extra que sale en la web y en el email */
  note: string;
  /** Días para hacer la transferencia */
  deadlineDays: number;
}

/** Lo que hay que transferir para completar una compra, inscripción o cita. */
export interface TransferInfo extends PaymentSettings {
  /** Concepto de la transferencia, p. ej. UROS-4F7K2Q */
  reference: string;
  amount: number;
}

/** Gratis (ya confirmado) o pendiente de transferencia, con sus datos y si se ha mandado el email. */
export type CheckoutResult =
  | { free: true }
  | { free: false; transfer: TransferInfo; emailSent: boolean };

// La función responde con { error: "..." } y un 400; supabase-js deja esa respuesta
// en error.context sin leer, así que hay que sacar el mensaje de ahí.
async function functionErrorMessage(error: any, fallback: string): Promise<string> {
  try {
    const body = await error?.context?.json?.();
    if (typeof body?.error === 'string' && body.error) return body.error;
  } catch { /* respuesta sin JSON */ }
  return fallback;
}

/**
 * Compras, inscripciones y citas: las crea la función create-checkout-session, que
 * valida los datos, calcula el importe y devuelve los datos de la transferencia.
 */
async function checkout(body: Record<string, unknown>, fallback: string): Promise<CheckoutResult> {
  const { data, error } = await supabase.functions.invoke('create-checkout-session', { body });
  if (error) throw new Error(await functionErrorMessage(error, fallback));
  if (data?.free) return { free: true };
  const t = data?.transfer;
  if (!t || typeof t.reference !== 'string' || typeof t.amount !== 'number') throw new Error(fallback);
  return { free: false, transfer: t, emailSent: data.emailSent === true };
}

export class PaymentAdapter {
  /** Carrito de la tienda. */
  checkoutCart(cart: any[]): Promise<CheckoutResult> {
    const cartItems = cart.map(c => ({ itemId: c.product.id, quantity: c.quantity, options: c.selectedVariables || {} }));
    return checkout({ cartItems }, 'No se pudo hacer el pedido.');
  }

  /** Inscripción a un campus, torneo o viaje. */
  registerForEvent(campusRegistration: Record<string, unknown>): Promise<CheckoutResult> {
    return checkout({ checkoutType: 'campus', campusRegistration }, 'No se pudo hacer la inscripción.');
  }

  /** Cita de pago: aparta el hueco hasta que llegue la transferencia. */
  bookPaidAppointment(appointment: { providerId: string; startsAt: string; patientName: string; notes: string }): Promise<CheckoutResult> {
    return checkout({ checkoutType: 'appointment', appointment: { ...appointment, notes: appointment.notes || null } }, 'No se pudo reservar la cita.');
  }

  /** Precio final con un cupón (torneos y viajes), o un error en español si no vale. */
  async checkCoupon(eventId: string, code: string): Promise<number> {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { checkCoupon: { eventId, code } }
    });
    if (error) throw new Error(await functionErrorMessage(error, 'No se pudo comprobar el cupón.'));
    if (typeof data?.price !== 'number') throw new Error('No se pudo comprobar el cupón.');
    return data.price;
  }

  async getSettings(): Promise<PaymentSettings> {
    const { data, error } = await supabase.from('payment_settings').select('iban, holder, note, deadline_days').maybeSingle();
    if (error) throw error;
    return { iban: data?.iban || '', holder: data?.holder || '', note: data?.note || '', deadlineDays: data?.deadline_days || 3 };
  }

  async saveSettings({ deadlineDays, ...settings }: PaymentSettings): Promise<void> {
    const { error } = await supabase.from('payment_settings')
      .update({ ...settings, deadline_days: deadlineDays, updated_at: new Date().toISOString() })
      .eq('id', true);
    if (error) throw error;
  }
}
