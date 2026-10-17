import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// Un enlace de correo caducado o ya usado vuelve a la web con #error_code=otp_expired.
// Se mira antes de crear el cliente, por si borra el fragmento al leerlo.
let expiredEmailLink = typeof window !== 'undefined' && window.location.hash.includes('error_code=otp_expired');

export const supabase = createClient(supabaseUrl, supabaseKey);

export const PASSWORD_RECOVERY_EVENT = 'uros:password-recovery';

// El enlace de "recuperar contraseña" trae la sesión en el fragmento de la URL
// (#...type=recovery). No se puede navegar hasta que el cliente la haya leído y
// guardado, o se pierde; este evento llega justo después.
let passwordRecovery = false;

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    passwordRecovery = true;
    window.dispatchEvent(new Event(PASSWORD_RECOVERY_EVENT));
  }
});

/** Devuelve true una sola vez si se ha llegado desde un enlace de recuperación. */
export function consumePasswordRecovery(): boolean {
  const pending = passwordRecovery;
  passwordRecovery = false;
  return pending;
}

/** Devuelve true una sola vez si se ha llegado desde un enlace de correo caducado o ya usado. */
export function consumeExpiredEmailLink(): boolean {
  const pending = expiredEmailLink;
  expiredEmailLink = false;
  return pending;
}
