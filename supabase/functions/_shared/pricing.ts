// Cálculo del precio de una inscripción (campus, torneos y viajes).
// Lo usan la web, para enseñar el precio, y la función create-checkout-session,
// que es la que de verdad cobra: así las dos calculan exactamente lo mismo.
// Sin dependencias, para que funcione igual en el navegador y en Deno.

/**
 * Tabla de precios de un evento.
 * - prices[a][d]: precio TOTAL para a+1 asistentes y d+1 días (con byDays),
 *   o prices[a][0]: precio total del evento completo para a+1 asistentes (sin byDays).
 * - extraAttendee: a partir de la última fila, lo que se suma por cada asistente
 *   de más (por día si byDays, por evento si no), sobre el precio de la última fila.
 */
export interface PriceTable {
  byDays: boolean;
  prices: number[][];
  extraAttendee: number;
}

/** Sistema anterior (precio por día con tramos y % por asistentes); solo para eventos sin tabla. */
export interface LegacyPricing {
  price_per_day?: number | string | null;
  price_tiers?: { minDays: number; pricePerDay: number }[] | null;
  attendee_discounts?: { minAttendees: number; discountPct: number }[] | null;
}

export interface PricedEvent extends LegacyPricing {
  dates?: string[] | null;
  price_table?: unknown;
}

export const MAX_TABLE_ROWS = 10;
export const MAX_TABLE_DAYS = 60;
export const MAX_PRICE = 100000;

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
  if (typeof t.byDays !== 'boolean' || !isPrice(t.extraAttendee) || !Array.isArray(t.prices)) return null;
  const cols = tableColumns(t.byDays, numDates);
  if (cols < 1 || cols > MAX_TABLE_DAYS) return null;
  if (t.prices.length < 1 || t.prices.length > MAX_TABLE_ROWS) return null;
  for (const row of t.prices) {
    if (!Array.isArray(row) || row.length !== cols || !row.every(isPrice)) return null;
  }
  return { byDays: t.byDays, prices: t.prices as number[][], extraAttendee: t.extraAttendee };
}

/** Precio total con la tabla. numDays se ignora si el evento se paga completo. */
export function tablePrice(table: PriceTable, numAttendees: number, numDays: number): number {
  const col = table.byDays ? numDays - 1 : 0;
  const rows = table.prices.length;
  if (numAttendees <= rows) return roundCents(table.prices[numAttendees - 1][col]);
  const units = table.byDays ? numDays : 1;
  return roundCents(table.prices[rows - 1][col] + table.extraAttendee * (numAttendees - rows) * units);
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

/** Tabla del evento si tiene una válida; null si usa el sistema anterior. */
export function eventTable(ev: PricedEvent): PriceTable | null {
  return parsePriceTable(ev.price_table, (ev.dates || []).length);
}

/** Si el evento se paga completo, no se eligen días: se va a todos. */
export function choosesDays(ev: PricedEvent): boolean {
  return eventTable(ev)?.byDays ?? true;
}

/** Precio total de una inscripción, con la tabla o, si el evento no tiene, con el sistema anterior. */
export function eventPrice(ev: PricedEvent, numAttendees: number, numDays: number): number {
  const table = eventTable(ev);
  return table ? tablePrice(table, numAttendees, numDays) : legacyPrice(ev, numAttendees, numDays);
}

/** Precio más bajo posible (1 asistente, 1 día o evento completo), para el "Desde X €". */
export function startingPrice(ev: PricedEvent): number {
  const table = eventTable(ev);
  if (table) return roundCents(table.prices[0][0]);
  return legacyPrice(ev, 1, 1);
}

/** Gratis si ninguna combinación cuesta nada. */
export function isFreeEvent(ev: PricedEvent): boolean {
  const table = eventTable(ev);
  if (table) return table.extraAttendee === 0 && table.prices.every(row => row.every(p => p === 0));
  return (Number(ev.price_per_day) || 0) === 0 && (ev.price_tiers || []).every(t => Number(t.pricePerDay) === 0);
}
