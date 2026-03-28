export interface User {
  id: string;
  email: string;
  role: 'admin' | 'coach' | 'user';
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

export interface Event {
  id: string;
  title: string;
  date: string;
  dates: string[];
  location: string;
  imageUrl?: string;
  description?: string;
  schedule?: string;
  type: 'campus';
  price_per_day: number;
  price_tiers: { minDays: number; pricePerDay: number }[];
  attendee_discounts: { minAttendees: number; discountPct: number }[];
  custom_fields?: CustomField[];
  max_capacity?: number;
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
