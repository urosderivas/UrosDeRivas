import type { PriceOption, PriceTable } from './pricing';
import type { Role } from './roles';

export interface User {
  id: string;
  email: string;
  role: Role;
}

/** Datos de contacto que pone cada usuario en "Mi cuenta" (el email es el de la cuenta). */
export interface UserProfile {
  first_name: string;
  last_name: string;
  phone: string;
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
  /** Si sale en la tienda; un producto oculto no se puede comprar */
  active?: boolean;
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
  /** false = se sigue viendo pero no admite inscripciones (también se cierran solas al pasar sus fechas) */
  registration_open: boolean;
}

export interface CampusRegistration {
  id: string;
  event_id: string;
  event_title?: string;
  user_id: string;
  user_email?: string;
  selected_days: string[];
  /** Días de cada asistente, en el orden de attendee_names (null en las antiguas: todos iguales) */
  attendee_days?: string[][] | null;
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
  amount: number;
  /** Concepto de la transferencia (UROS-...), o la sesión de Stripe en las antiguas */
  stripe_session_id: string | null;
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
  /** false = oculta: solo la ven los admins */
  active: boolean;
}

/** Horario semanal de un calendario: "1" = lunes ... "7" = domingo, tramos ["09:00", "13:00"] en hora de Madrid. */
export type WeeklyHours = Record<string, [string, string][]>;

/** Calendario de citas de un fisio o recuperador. */
export interface AppointmentProvider {
  id: string;
  /** Fisio que lo gestiona; vacío = lo gestiona administración */
  user_id: string | null;
  name: string;
  service: string;
  description: string | null;
  duration_minutes: number;
  weekly_hours: WeeklyHours;
  min_notice_hours: number;
  max_days_ahead: number;
  cancel_hours: number;
  active: boolean;
  /** Precio fijo de cada cita en euros; 0 = gratis */
  price: number;
}

export type AppointmentStatus = 'booked' | 'done' | 'no_show' | 'cancelled';

export interface Appointment {
  id: string;
  provider_id: string;
  user_id: string | null;
  user_email: string | null;
  patient_name: string;
  /** Pago: null = sin pago (gratis o apuntada por el club); pending = esperando la transferencia */
  payment?: 'pending' | 'paid' | 'failed' | null;
  amount?: number | null;
  /** Hasta cuándo se guarda el hueco mientras se paga (sin límite con transferencia) */
  hold_until?: string | null;
  /** Concepto de la transferencia (UROS-...), o la sesión de Stripe en las citas antiguas */
  stripe_session_id?: string | null;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  created_at: string;
  provider?: Pick<AppointmentProvider, 'name' | 'service' | 'cancel_hours'>;
}

/** Horario de un día concreto que sustituye al semanal ese día ([] = ese día no hay citas). */
export type DayHours = Record<string, [string, string][]>;

/** Hueco cerrado en un calendario (vacaciones, un torneo...). */
export interface AppointmentBlock {
  id: string;
  provider_id: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
}
