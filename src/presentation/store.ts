import { create } from 'zustand';
import { User, MarketItem, Event } from '../domain/entities';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';

const adapter = new SupabaseAdapter();

interface AppState {
  user: User | null;
  items: MarketItem[];
  events: Event[];
  loading: boolean;
  
  // Actions
  initAuth: () => Promise<void>;
  signIn: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  
  fetchItems: () => Promise<void>;
  fetchEvents: () => Promise<void>;
  logActivity: (actionType: string, metadata?: any) => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  items: [],
  events: [],
  loading: false,

  initAuth: async () => {
    try {
      const user = await adapter.getUser();
      set({ user });
    } catch (e) {
      console.error(e);
      set({ user: null });
    }
  },

  signIn: async (email, pass) => {
    const user = await adapter.signIn(email, pass);
    set({ user });
  },

  signInWithGoogle: async () => {
    // Calling the adapter redirects the window dynamically
    await adapter.signInWithGoogle();
  },

  signOut: async () => {
    await adapter.signOut();
    set({ user: null });
  },

  fetchItems: async () => {
    set({ loading: true });
    try {
      const items = await adapter.getItems();
      set({ items, loading: false });
    } catch(e) {
      console.error(e);
      set({ loading: false });
    }
  },

  fetchEvents: async () => {
    set({ loading: true });
    try {
      const events = await adapter.getEvents();
      set({ events, loading: false });
    } catch(e) {
      console.error(e);
      set({ loading: false });
    }
  },

  logActivity: async (actionType, metadata) => {
    try {
      await adapter.createLog(actionType, metadata);
    } catch (e) {
      // Intentionally swallow errors for telemetry to avoid crashing UI
    }
  }
}));
