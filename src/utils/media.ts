/** Las imágenes pueden ser URLs completas o rutas dentro de public/ (assets/...). */
export function resolveImageUrl(url: string): string {
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return `${import.meta.env.BASE_URL}${url.replace(/^\//, '')}`;
}
