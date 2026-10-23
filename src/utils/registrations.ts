import { formatDateRanges } from './dates';

type RegistrationLike = {
  attendee_names?: string[] | null;
  selected_days?: string[] | null;
  /** Días de cada asistente, en el orden de attendee_names (solo inscripciones nuevas) */
  attendee_days?: string[][] | null;
  custom_data?: Record<string, unknown> | null;
};

/**
 * Asistentes y sus días: "Ana, Luis | 6-9 jul" si van todos los mismos días,
 * o "Ana: 6-9 jul · Luis: 6-11 jul" si cada uno va unos días.
 */
export function attendeeDaysText(r: RegistrationLike): string {
  const names = r.attendee_names || [];
  const perAttendee = r.attendee_days;
  const sameDays = !perAttendee || perAttendee.every(d => d.join() === (perAttendee[0] || []).join());
  if (sameDays) {
    return [names.join(', '), formatDateRanges(perAttendee?.[0] || r.selected_days || [], { weekday: false })].filter(Boolean).join(' | ');
  }
  return names.map((n, i) => `${n}: ${formatDateRanges(perAttendee[i] || [], { weekday: false })}`).join(' · ');
}

/**
 * Detalle de una inscripción para el justificante, el QR y "Mis inscripciones":
 * jugadores, fechas y lo elegido en el formulario (opción de precio, cupón...).
 */
export function registrationDetail(r: RegistrationLike): string {
  const extras = Object.entries(r.custom_data || {}).map(([k, v]) => `${k}: ${v}`);
  return [attendeeDaysText(r), ...extras].join(' | ');
}
