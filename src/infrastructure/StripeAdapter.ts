import { supabase } from '../utils/supabase';
import { PaymentPort } from '../application/ports';

// Sesión de Stripe en curso, para poder cancelarla si el usuario vuelve sin pagar
const PENDING_SESSION_KEY = 'pending_checkout_session';

function rememberSession(sessionId: unknown) {
  try {
    if (typeof sessionId === 'string') sessionStorage.setItem(PENDING_SESSION_KEY, sessionId);
  } catch { /* sin sessionStorage la sesión caduca sola en Stripe */ }
}

export class StripeAdapter implements PaymentPort {
  /**
   * Invokes a secure Supabase Edge Function to generate a Stripe Checkout URL.
   * This ensures the Stripe Secret Key is never exposed to the frontend.
   */
  async createCheckoutSession(itemId: string, userEmail: string, size?: string): Promise<string> {
    const returnUrl = window.location.href.split('?')[0]; // Remove existing query params
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { itemId, userEmail, returnUrl, size }
    });

    if (error) {
      console.error("Error invoking Stripe Edge Function:", error);
      // Supabase Edge Functions return an error object that might contain the message
      const errMsg = error.context?.error || error.message || "No se pudo iniciar la sesión de pago segura";
      throw new Error(errMsg);
    }

    if (!data?.url) {
      throw new Error("La función no devolvió una URL de Stripe válida.");
    }

    return data.url;
  }

  async createCampusCheckoutSession(campusRegistration: any, userEmail: string): Promise<string> {
    const returnUrl = window.location.href.split('?')[0]; 
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { 
        checkoutType: 'campus',
        campusRegistration,
        userEmail, 
        returnUrl 
      }
    });

    if (error) {
      console.error("Error invoking Stripe Edge Function:", error);
      const errMsg = error.context?.error || error.message || "Error al procesar inscripción.";
      throw new Error(errMsg);
    }

    if (!data?.url) throw new Error("Url de Stripe inválida.");
    rememberSession(data.sessionId);
    return data.url;
  }

  /** Reserva para pagar en mano: el servidor valida la inscripción y calcula el importe. */
  async reserveCampusPayLocal(campusRegistration: any): Promise<number> {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        checkoutType: 'campus',
        campusRegistration: { ...campusRegistration, payLocal: true }
      }
    });

    if (error) {
      console.error("Error invoking Stripe Edge Function:", error);
      const errMsg = error.context?.error || error.message || "Error al reservar la inscripción.";
      throw new Error(errMsg);
    }

    if (!data?.reserved) throw new Error("No se pudo confirmar la reserva.");
    return Number(data.amount) || 0;
  }

  async createCheckoutSessionFromCart(cart: any[], userEmail: string): Promise<string> {
    const returnUrl = window.location.href.split('?')[0]; 
    const payload = cart.map(c => ({
      itemId: c.product.id,
      quantity: c.quantity,
      options: c.selectedVariables || {}
    }));

    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { cartItems: payload, userEmail, returnUrl }
    });

    if (error) {
      console.error("Error invoking Stripe Edge Function:", error);
      const errMsg = error.context?.error || error.message || "Error al procesar carrito.";
      throw new Error(errMsg);
    }

    // Handle free order (all items at price 0)
    if (data?.freeOrder) {
      return `${returnUrl}?success=true&session_id=free`;
    }

    if (!data?.url) throw new Error("Url de Stripe inválida.");
    rememberSession(data.sessionId);
    return data.url;
  }

  /** El usuario ha vuelto de Stripe sin pagar: cierra esa sesión y cancela lo pendiente. */
  async cancelPendingCheckout(): Promise<void> {
    let sessionId: string | null = null;
    try { sessionId = sessionStorage.getItem(PENDING_SESSION_KEY); } catch { /* nada que cancelar */ }
    if (!sessionId) return;

    const { error } = await supabase.functions.invoke('create-checkout-session', {
      body: { cancelSessionId: sessionId }
    });
    if (error) {
      // Si falla, Stripe la caducará igualmente y el webhook la cancelará
      console.error("Error cancelling Stripe session:", error);
      return;
    }
    try { sessionStorage.removeItem(PENDING_SESSION_KEY); } catch { /* ignorar */ }
  }
}
