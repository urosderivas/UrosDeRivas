// Fechas y horas de las citas, siempre en hora de Madrid (la del club), esté donde esté
// quien mira la web. La base de datos guarda instantes (UTC) y calcula los huecos en Madrid.

const TZ = 'Europe/Madrid';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function madridParts(d: Date) {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFmt.formatToParts(d)) p[type] = value;
  return p;
}

/** Día en Madrid, como "2026-11-06". */
export function madridDay(d: Date | string): string {
  const p = madridParts(new Date(d));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hora en Madrid, como "09:45". */
export function madridTime(d: Date | string): string {
  const p = madridParts(new Date(d));
  return `${p.hour}:${p.minute}`;
}

/** Instante de un día y una hora de Madrid ("2026-11-06", "09:45"). */
export function madridToDate(day: string, time: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, h, mi);
  // Se ajusta la diferencia horaria de Madrid ese día (dos pasos por el cambio de hora)
  let t = wanted;
  for (let i = 0; i < 2; i++) {
    const p = madridParts(new Date(t));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    t += wanted - shown;
  }
  return new Date(t);
}

/** Hoy en Madrid. */
export const madridToday = () => madridDay(new Date());

/** Suma días a un día "2026-11-06". */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Día de la semana de un día "2026-11-06": 1 = lunes ... 7 = domingo. */
export function isoWeekday(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

const longFmt = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Viernes, 6 de noviembre" para un día "2026-11-06". */
export function formatDayLong(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return capitalize(longFmt.format(new Date(Date.UTC(y, m - 1, d))));
}

const monthFmt = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** "Noviembre de 2026" para el mes de un día. */
export function formatMonth(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return capitalize(monthFmt.format(new Date(Date.UTC(y, m - 1, 1))));
}
