import type { EventType } from '../domain/entities';

/** Página de cada tipo de evento y textos que cambian entre una y otra. */
export const EVENT_PAGES: Record<EventType, {
  path: string;
  title: string;
  badge: string;
  /** "este campus" / "este evento" */
  noun: string;
  create: string;
  empty: string;
}> = {
  campus: {
    path: '/events', title: 'Campus', badge: 'CAMPUS', noun: 'campus',
    create: '+ Crear Campus', empty: 'No hay campus disponibles actualmente.',
  },
  torneo: {
    path: '/torneos', title: 'Torneos y viajes', badge: 'TORNEO / VIAJE', noun: 'evento',
    create: '+ Crear torneo o viaje', empty: 'No hay torneos ni viajes disponibles actualmente.',
  },
};

/** Enlace directo a un evento, abierto en su página (p. ej. desde una noticia). */
export function eventPath(ev: { id: string; type?: EventType }): string {
  return ev.type === 'torneo' ? `/torneos?evento=${ev.id}` : `/events?campus=${ev.id}`;
}
