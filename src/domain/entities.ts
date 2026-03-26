export interface User {
  id: string;
  email: string;
  role: 'admin' | 'coach' | 'user';
}

export interface MarketItem {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  description?: string;
  sizes?: string[];
  stripe_price_id?: string;
}

export interface Event {
  id: string;
  title: string;
  date: string; // ISO string
  location: string;
  imageUrl?: string;
  description?: string;
  type: 'match' | 'training' | 'campus';
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
  user_id?: string;
  buyer_name: string;
  buyer_email: string;
  item_id: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  amount: number;
  stripe_session_id?: string;
  created_at: string;
}
