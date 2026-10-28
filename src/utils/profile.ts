import type { UserProfile } from '../domain/entities';

/** Deja el teléfono como lo guarda la base de datos: cifras y espacios, con + delante si lleva prefijo. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+') || trimmed.startsWith('00');
  const digits = trimmed.replace(/^00/, '').replace(/\D/g, '');
  if (!digits) return '';
  // Los españoles se agrupan como se leen: 600 123 456
  const spanish = (n: string) => n.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  if (!plus) return digits.length === 9 ? spanish(digits) : digits;
  return digits.length === 11 && digits.startsWith('34') ? `+34 ${spanish(digits.slice(2))}` : `+${digits}`;
}

/** Teléfono vacío o con entre 9 y 15 cifras (con prefijo internacional como mucho 15). */
export function phoneError(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 9 || digits.length > 15) return 'El teléfono debe tener al menos 9 cifras (y como mucho 15).';
  return null;
}

export const fullName = (p?: UserProfile | null) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : '';

/** Enlace para llamar desde el móvil. */
export const telHref = (phone: string) => `tel:${phone.replace(/\s/g, '')}`;
