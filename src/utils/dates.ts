// Fechas de un evento en pocas palabras: los días seguidos se juntan en un rango
// ("vie 6 nov – sáb 28 nov") en vez de listarlos uno a uno.

const DAY_MS = 24 * 60 * 60 * 1000;
const toTime = (iso: string) => Date.parse(`${iso}T12:00:00Z`);

/** Grupos de días seguidos: [[primero, último], ...], en orden. */
export function dateRanges(dates: string[]): [string, string][] {
  const sorted = Array.from(new Set(dates)).sort();
  const ranges: [string, string][] = [];
  for (const d of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && toTime(d) - toTime(last[1]) === DAY_MS) last[1] = d;
    else ranges.push([d, d]);
  }
  return ranges;
}

/** "vie 6 nov – sáb 28 nov · lun 1 dic"; con weekday false, "6 nov – 28 nov". */
export function formatDateRanges(dates: string[], { weekday = true } = {}): string {
  const fmt = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString('es-ES', {
    ...(weekday ? { weekday: 'short' as const } : {}), day: 'numeric', month: 'short',
  });
  return dateRanges(dates)
    .map(([from, to]) => (from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`))
    .join(' · ');
}
