/** Las imágenes pueden ser URLs completas o rutas dentro de public/ (assets/...). */
export function resolveImageUrl(url: string): string {
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return `${import.meta.env.BASE_URL}${url.replace(/^\//, '')}`;
}

/** Escudo del club (cabecera, pie, portada, justificantes). */
export const clubLogoUrl = `${import.meta.env.BASE_URL}assets/logo_uros.png`;

/** Logo del club, para cuando una imagen falta o no carga. */
export const fallbackImageUrl = clubLogoUrl;

/** onError de <img>: cambia la imagen rota por el logo (una sola vez). */
export function showFallbackImage(e: { currentTarget: HTMLImageElement }) {
  const img = e.currentTarget;
  if (img.dataset.fallback) return;
  img.dataset.fallback = '1';
  img.src = fallbackImageUrl;
  img.classList.add('img-fallback');
}
