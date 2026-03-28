import { create } from 'zustand';
import { User, MarketItem, Event, CartItem } from '../domain/entities';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';

const adapter = new SupabaseAdapter();

interface AppState {
  user: User | null;
  items: MarketItem[];
  events: Event[];
  loading: boolean;
  cart: CartItem[];
  
  // Actions
  initAuth: () => Promise<void>;
  signIn: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchItems: () => Promise<void>;
  fetchEvents: () => Promise<void>;
  logActivity: (actionType: string, metadata?: any) => Promise<void>;

  // Cart Operations
  addToCart: (item: CartItem) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
  updateCartQuantity: (cartItemId: string, quantity: number) => void;
}

export const useStore = create<AppState>()((set) => ({
  user: null,
  items: [],
  events: [],
  cart: [],
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
      // Intentionally swallow errors
    }
  },

  addToCart: (item) => {
    set((state) => {
      const existingIdx = state.cart.findIndex(c => c.cartItemId === item.cartItemId);
      if (existingIdx !== -1) {
        const newCart = [...state.cart];
        newCart[existingIdx].quantity += item.quantity;
        return { cart: newCart };
      }
      return { cart: [...state.cart, item] };
    });
  },
  
  removeFromCart: (cartItemId) => set(state => ({ cart: state.cart.filter(c => c.cartItemId !== cartItemId) })),
  
  clearCart: () => set({ cart: [] }),
  
  updateCartQuantity: (cartItemId, quantity) => set(state => ({
    cart: state.cart.map(c => c.cartItemId === cartItemId ? { ...c, quantity } : c)
  }))
}));
