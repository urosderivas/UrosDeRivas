import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

// El enlace del correo "recuperar contraseña" vuelve a la web con #...type=recovery.
// Se mira antes de crear el cliente, que borra ese fragmento de la URL al leerlo.
let passwordRecovery = typeof window !== 'undefined' && window.location.hash.includes('type=recovery');

export const supabase = createClient(supabaseUrl, supabaseKey);

export const PASSWORD_RECOVERY_EVENT = 'uros:password-recovery';

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
