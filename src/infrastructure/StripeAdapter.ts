import { supabase } from '../utils/supabase';
import { PaymentPort } from '../application/ports';

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
}
