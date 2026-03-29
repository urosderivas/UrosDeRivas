import { User, MarketItem, Event } from '../domain/entities';

export interface AuthPort {
  getUser(): Promise<User | null>;
  signIn(email: string, password: string): Promise<User>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

export interface MarketPort {
  getItems(): Promise<MarketItem[]>;
  createItem(item: Omit<MarketItem, 'id'>): Promise<MarketItem>;
  updateItem(id: string, item: Partial<MarketItem>): Promise<MarketItem>;
  deleteItem(id: string): Promise<void>;
}

export interface EventPort {
  getEvents(): Promise<Event[]>;
  createEvent(event: Omit<Event, 'id'>): Promise<Event>;
  updateEvent(id: string, event: Partial<Event>): Promise<Event>;
  deleteEvent(id: string): Promise<void>;
}

export interface SystemLogPort {
  getLogs(): Promise<any[]>;
  deleteLog(id: string): Promise<void>;
  createLog(actionType: string, metadata?: any): Promise<void>;
}

export interface PaymentPort {
  createCheckoutSession(itemId: string, userEmail: string): Promise<string>;
}

export interface OrderPort {
  getOrders(): Promise<any[]>;
  updateOrderStatus(id: string, status: string): Promise<any>;
  deleteOrder(id: string): Promise<void>;
}
