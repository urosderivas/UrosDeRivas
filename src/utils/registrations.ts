import { formatDateRanges } from './dates';

/**
 * Detalle de una inscripción para el justificante, el QR y "Mis inscripciones":
 * jugadores, fechas y lo elegido en el formulario (opción de precio, cupón...).
 */
export function registrationDetail(r: { attendee_names?: string[] | null; selected_days?: string[] | null; custom_data?: Record<string, unknown> | null }): string {
  const extras = Object.entries(r.custom_data || {}).map(([k, v]) => `${k}: ${v}`);
  return [(r.attendee_names || []).join(', '), formatDateRanges(r.selected_days || [], { weekday: false }), ...extras].join(' | ');
}
