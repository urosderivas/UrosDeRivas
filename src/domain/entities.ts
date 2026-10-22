import type { PriceOption, PriceTable } from './pricing';
import type { Role } from './roles';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface CustomField {
  name: string;
  type: 'text' | 'categorical';
  options?: string[];
  required: boolean;
}

export interface MarketItem {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  description?: string;
  sizes?: string[];
  stripe_price_id?: string;
  custom_fields?: CustomField[];
}

export interface CartItem {
  cartItemId: string;
  product: MarketItem;
  quantity: number;
  selectedVariables: Record<string, string>;
}

/** campus: pestaña Campus; torneo: pestaña Torneos y viajes */
export type EventType = 'campus' | 'torneo';

export interface Event {
  id: string;
  title: string;
  date: string;
  dates: string[];
  location: string;
  imageUrl?: string;
  description?: string;
  schedule?: string;
  type: EventType;
  /** Sistema de precios anterior; solo se usa si el evento no tiene price_table */
  price_per_day: number;
  price_tiers: { minDays: number; pricePerDay: number }[];
  attendee_discounts: { minAttendees: number; discountPct: number }[];
  /** Precio total por nº de asistentes y nº de días (ver domain/pricing.ts) */
  price_table?: PriceTable | null;
  /** Torneos y viajes: precio por jugador, fijo (una opción) o a elegir (p. ej. con o sin bus) */
  price_options?: PriceOption[] | null;
  custom_fields?: CustomField[];
  /** Plazas (asistentes) en total; null o vacío = sin límite */
  max_capacity?: number | null;
  active: boolean;
}

export interface CampusRegistration {
  id: string;
  event_id: string;
  event_title?: string;
  user_id: string;
  user_email?: string;
  selected_days: string[];
  num_attendees: number;
  attendee_names: string[];
  amount: number;
  status: 'pending' | 'completed' | 'cancelled';
  stripe_session_id?: string;
  custom_data: Record<string, string>;
  created_at: string;
}

/** Inscripción propia, para saber si ya está inscrito (en torneos, a qué jugadores). */
export interface OwnRegistration {
  id: string;
  event_id: string;
  status: 'pending' | 'completed' | 'cancelled';
  attendee_names: string[];
}

/** Cupón de un torneo o viaje: un solo uso, fija el precio final. */
export interface EventCoupon {
  id: string;
  event_id: string;
  code: string;
  price: number;
  note: string | null;
  created_at: string;
  /** Último pago en el que se usó; si su inscripción está completada, el cupón está gastado */
  stripe_session_id: string | null;
}

export interface SystemLog {
  id: string;
  action_type: string;
  metadata?: any;
  user_id?: string;
  user_email?: string;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  buyer_name: string;
  buyer_email: string;
  item_id: string;
  item_name?: string;
  size?: string;
  quantity: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  amount: number;
  stripe_session_id?: string;
  created_at: string;
}

export interface Sponsor {
  id: string;
  name: string;
  /** URL completa o ruta dentro de public/ (assets/sponsors/...) */
  imageUrl: string;
  linkUrl?: string;
  sortOrder: number;
  active: boolean;
}

export interface NewsPost {
  id: string;
  title: string;
  /** Texto plano; los enlaces se escriben como [texto](https://...) */
  body: string;
  imageUrl?: string;
  /** Campus, torneo o viaje relacionado (opcional) */
  eventId?: string;
  publishedAt: string;
}

/** Horario semanal de un calendario: "1" = lunes ... "7" = domingo, tramos ["09:00", "13:00"] en hora de Madrid. */
export type WeeklyHours = Record<string, [string, string][]>;

/** Calendario de citas de un fisio o recuperador. */
export interface AppointmentProvider {
  id: string;
  user_id: string;
  name: string;
  service: string;
  description: string | null;
  duration_minutes: number;
  weekly_hours: WeeklyHours;
  min_notice_hours: number;
  max_days_ahead: number;
  cancel_hours: number;
  active: boolean;
}

export type AppointmentStatus = 'booked' | 'done' | 'no_show' | 'cancelled';

export interface Appointment {
  id: string;
  provider_id: string;
  user_id: string | null;
  user_email: string | null;
  patient_name: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  created_at: string;
  provider?: Pick<AppointmentProvider, 'name' | 'service' | 'cancel_hours'>;
}

/** Hueco cerrado en un calendario (vacaciones, un torneo...). */
export interface AppointmentBlock {
  id: string;
  provider_id: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
}
