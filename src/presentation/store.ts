import { create } from 'zustand';
import { User, MarketItem, Event, CartItem } from '../domain/entities';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';

const adapter = new SupabaseAdapter();

// El carrito se guarda en el navegador para que no se pierda al recargar.
const CART_KEY = 'uros_cart';

function loadCart(): CartItem[] {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(c => c && c.cartItemId && c.product && c.quantity > 0) : [];
  } catch {
    return [];
  }
}

function saveCart(cart: CartItem[]) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* sin almacenamiento */ }
}

// Al pagar el carrito en Stripe se marca, para vaciarlo solo si el pago se completa
// (un "Comprar ahora" de un producto suelto no toca el carrito).
const CART_CHECKOUT_KEY = 'cart_checkout';

export function markCartCheckout() {
  try { sessionStorage.setItem(CART_CHECKOUT_KEY, '1'); } catch { /* sin almacenamiento */ }
}

export function takeCartCheckout(): boolean {
  try {
    const marked = sessionStorage.getItem(CART_CHECKOUT_KEY) === '1';
    sessionStorage.removeItem(CART_CHECKOUT_KEY);
    return marked;
  } catch {
    return false;
  }
}

interface AppState {
  user: User | null;
  items: MarketItem[];
  events: Event[];
  loading: boolean;
  cart: CartItem[];
  
  // Actions
  initAuth: () => Promise<void>;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
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
  cart: loadCart(),
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

  signUp: async (email, pass) => {
    await adapter.signUp(email, pass);
  },

  signInWithGoogle: async () => {
    await adapter.signInWithGoogle();
  },

  sendPasswordReset: async (email) => {
    await adapter.sendPasswordReset(email);
  },

  updatePassword: async (password) => {
    await adapter.updatePassword(password);
  },

  signOut: async () => {
    await adapter.signOut();
    set({ user: null });
  },

  fetchItems: async () => {
    set({ loading: true });
    try {
      const items = await adapter.getItems();
      // El carrito guardado puede tener productos borrados o con otro precio: se actualiza
      set(state => ({
        items,
        loading: false,
        cart: state.cart.flatMap(c => {
          const product = items.find(i => i.id === c.product.id);
          return product ? [{ ...c, product }] : [];
        }),
      }));
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
        newCart[existingIdx] = { ...newCart[existingIdx], quantity: newCart[existingIdx].quantity + item.quantity };
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

useStore.subscribe((state, prev) => {
  if (state.cart !== prev.cart) saveCart(state.cart);
});
