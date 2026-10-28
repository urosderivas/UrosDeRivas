// Cálculo del precio de una inscripción: campus (tabla por asistentes y días) y
// torneos y viajes (precio por jugador, fijo o a elegir entre opciones).
// Lo usan la web, para enseñar el precio, y la función create-checkout-session,
// que es la que de verdad cobra: así las dos calculan exactamente lo mismo.
// Sin dependencias, para que funcione igual en el navegador y en Deno.

/**
 * Tabla de precios de un evento.
 * - prices[a][d]: precio TOTAL para a+1 asistentes y d+1 días (con byDays),
 *   o prices[a][0]: precio total del evento completo para a+1 asistentes (sin byDays).
 * Una inscripción lleva como mucho tantos asistentes como filas tiene la tabla.
 * (Las tablas guardadas llevan también "extraAttendee", que ya no se usa.)
 */
export interface PriceTable {
  byDays: boolean;
  prices: number[][];
}

/** Sistema anterior (precio por día con tramos y % por asistentes); solo para eventos sin tabla. */
export interface LegacyPricing {
  price_per_day?: number | string | null;
  price_tiers?: { minDays: number; pricePerDay: number }[] | null;
  attendee_discounts?: { minAttendees: number; discountPct: number }[] | null;
}

/** Precio de un torneo o viaje para un jugador y todos sus días (p. ej. "Ida y vuelta en bus"). */
export interface PriceOption {
  label: string;
  price: number;
}

export interface PricedEvent extends LegacyPricing {
  type?: string | null;
  dates?: string[] | null;
  price_table?: unknown;
  price_options?: unknown;
}

export const MAX_TABLE_ROWS = 10;
export const MAX_TABLE_DAYS = 60;
export const MAX_PRICE = 100000;
export const MAX_PRICE_OPTIONS = 10;
export const MAX_OPTION_LABEL = 80;

const isPrice = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_PRICE;

export const roundCents = (v: number) => Math.round(v * 100) / 100;

/** Columnas que debe tener la tabla: una por fecha del evento, o una sola si se paga el evento completo. */
export function tableColumns(byDays: boolean, numDates: number): number {
  return byDays ? numDates : 1;
}

/**
 * Comprueba que la tabla está completa y es coherente con las fechas del evento.
 * Devuelve la tabla lista para usar, o null si falta o no es válida.
 */
export function parsePriceTable(raw: unknown, numDates: number): PriceTable | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.byDays !== 'boolean' || !Array.isArray(t.prices)) return null;
  const cols = tableColumns(t.byDays, numDates);
  if (cols < 1 || cols > MAX_TABLE_DAYS) return null;
  if (t.prices.length < 1 || t.prices.length > MAX_TABLE_ROWS) return null;
  for (const row of t.prices) {
    if (!Array.isArray(row) || row.length !== cols || !row.every(isPrice)) return null;
  }
  return { byDays: t.byDays, prices: t.prices as number[][] };
}

/** Precio total con la tabla. numDays se ignora si el evento se paga completo. */
export function tablePrice(table: PriceTable, numAttendees: number, numDays: number): number {
  const col = table.byDays ? numDays - 1 : 0;
  const rows = table.prices.length;
  if (numAttendees > rows) {
    throw new Error(`Como máximo ${rows} ${rows === 1 ? 'asistente' : 'asistentes'} por inscripción.`);
  }
  return roundCents(table.prices[numAttendees - 1][col]);
}

/** Asistentes que puede llevar una inscripción según la tabla; null si el evento no tiene tabla. */
export function maxTableAttendees(ev: PricedEvent): number | null {
  return eventTable(ev)?.prices.length ?? null;
}

/** Precio con el sistema anterior: precio por día según tramo de días, menos % por nº de asistentes. */
export function legacyPrice(ev: LegacyPricing, numAttendees: number, numDays: number): number {
  let pricePerDay = Number(ev.price_per_day) || 0;
  const tiers = [...(ev.price_tiers || [])].sort((a, b) => b.minDays - a.minDays);
  for (const tier of tiers) {
    if (numDays >= tier.minDays) { pricePerDay = Number(tier.pricePerDay) || 0; break; }
  }
  const subtotal = pricePerDay * numDays * numAttendees;
  let discountPct = 0;
  const discounts = [...(ev.attendee_discounts || [])].sort((a, b) => b.minAttendees - a.minAttendees);
  for (const d of discounts) {
    if (numAttendees >= d.minAttendees) { discountPct = Number(d.discountPct) || 0; break; }
  }
  return roundCents(subtotal - subtotal * (discountPct / 100));
}

/**
 * Comprueba las opciones de precio de un torneo o viaje (como el check de la base de datos).
 * Una opción = precio fijo (el nombre puede ir vacío); varias = cada una con su nombre.
 */
export function parsePriceOptions(raw: unknown): PriceOption[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_PRICE_OPTIONS) return null;
  const options: PriceOption[] = [];
  for (const o of raw) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const { label, price } = o as Record<string, unknown>;
    if (typeof label !== 'string' || label.length > MAX_OPTION_LABEL || !isPrice(price)) return null;
    options.push({ label: label.trim(), price });
  }
  if (options.length > 1 && options.some(o => !o.label)) return null;
  return options;
}

export const isTournament = (ev: PricedEvent) => ev.type === 'torneo';

/** Tabla del evento si tiene una válida; null si usa el sistema anterior. */
export function eventTable(ev: PricedEvent): PriceTable | null {
  return parsePriceTable(ev.price_table, (ev.dates || []).length);
}

/**
 * Opciones de precio de un torneo o viaje; null si no es torneo o están mal guardadas.
 * Un torneo guardado antes con tabla usa el precio de 1 asistente.
 */
export function eventOptions(ev: PricedEvent): PriceOption[] | null {
  if (!isTournament(ev)) return null;
  if (ev.price_options != null) return parsePriceOptions(ev.price_options);
  const table = eventTable(ev);
  return table ? [{ label: '', price: roundCents(table.prices[0][0]) }] : null;
}

/** Si el evento se paga completo, no se eligen días: se va a todos. */
export function choosesDays(ev: PricedEvent): boolean {
  if (isTournament(ev)) return false;
  return eventTable(ev)?.byDays ?? true;
}

/** Precio total de una inscripción, con la tabla o, si el evento no tiene, con el sistema anterior. */
export function eventPrice(ev: PricedEvent, numAttendees: number, numDays: number): number {
  const table = eventTable(ev);
  return table ? tablePrice(table, numAttendees, numDays) : legacyPrice(ev, numAttendees, numDays);
}

/**
 * Precio de una inscripción en la que cada asistente elige sus días (un número de días
 * por asistente): todos pagan la casilla de la tabla para los días del que menos va, y
 * cada uno que va más días paga aparte sus días de más como 1 asistente.
 * Ej.: 4 asistentes de 4, 4, 5 y 6 días → (4 asist., 4 días) + (1 asist., 1 día) + (1 asist., 2 días).
 * Si todos van los mismos días, sale igual que eventPrice.
 */
export function registrationPrice(ev: PricedEvent, daysPerAttendee: number[]): number {
  return roundCents(registrationTiers(ev, daysPerAttendee).reduce((sum, t) => sum + t.price, 0));
}

/** Partes de registrationPrice, para enseñar el desglose: la común y la de cada asistente que va más días. */
export function registrationTiers(ev: PricedEvent, daysPerAttendee: number[]): { attendees: number; days: number; price: number }[] {
  if (daysPerAttendee.length === 0) return [];
  const base = Math.min(...daysPerAttendee);
  return [
    { attendees: daysPerAttendee.length, days: base, price: eventPrice(ev, daysPerAttendee.length, base) },
    ...daysPerAttendee.filter(d => d > base).sort((x, y) => x - y)
      .map(d => ({ attendees: 1, days: d - base, price: eventPrice(ev, 1, d - base) })),
  ];
}

/** Precio más bajo posible (1 asistente, 1 día o evento completo), para el "Desde X €". */
export function startingPrice(ev: PricedEvent): number {
  const options = eventOptions(ev);
  if (options) return Math.min(...options.map(o => o.price));
  const table = eventTable(ev);
  if (table) return roundCents(table.prices[0][0]);
  return legacyPrice(ev, 1, 1);
}

/** Gratis si ninguna combinación cuesta nada. */
export function isFreeEvent(ev: PricedEvent): boolean {
  if (isTournament(ev)) return eventOptions(ev)?.every(o => o.price === 0) ?? false;
  const table = eventTable(ev);
  if (table) return table.prices.every(row => row.every(p => p === 0));
  return (Number(ev.price_per_day) || 0) === 0 && (ev.price_tiers || []).every(t => Number(t.pricePerDay) === 0);
}
