// Adónde volver después de iniciar sesión (p. ej. al campus en el que se quería inscribir).
const KEY = 'login_next';

/** Solo rutas internas de la web ("/events?campus=..."), nunca otra web. */
export function safeNextPath(path: string | null): string | null {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return null;
  return path;
}

/** Google sale de la web para iniciar sesión, así que la ruta se guarda en el navegador. */
export function rememberLoginNext(path: string | null) {
  const safe = safeNextPath(path);
  try {
    if (safe) sessionStorage.setItem(KEY, safe);
    else sessionStorage.removeItem(KEY);
  } catch { /* sin almacenamiento: se vuelve a Inicio */ }
}

export function takeLoginNext(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return safeNextPath(value);
  } catch {
    return null;
  }
}
