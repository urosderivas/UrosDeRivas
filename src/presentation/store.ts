import { create } from 'zustand';
import { User, UserProfile, MarketItem, Event, CartItem } from '../domain/entities';
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

interface AppState {
  user: User | null;
  items: MarketItem[];
  events: Event[];
  loading: boolean;
  cart: CartItem[];
  /** Nombre, apellidos y teléfono del usuario (null hasta que se cargan) */
  profile: UserProfile | null;
  /** Hay un recuadro abierto pidiendo los datos de contacto antes de pagar */
  contactRequest: ((ok: boolean) => void) | null;
  
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
  loadProfile: () => Promise<UserProfile | null>;
  saveProfile: (profile: UserProfile) => Promise<void>;
  /** Antes de comprar, inscribirse o reservar: pide nombre y teléfono si faltan. false si se cierra sin ponerlos. */
  ensureContact: () => Promise<boolean>;
  answerContact: (ok: boolean) => void;
  /** Borra la cuenta propia y cierra la sesión */
  deleteAccount: () => Promise<void>;

  // Cart Operations
  addToCart: (item: CartItem) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
  updateCartQuantity: (cartItemId: string, quantity: number) => void;
}

export const isProfileComplete = (p: UserProfile | null) =>
  !!p && !!p.first_name.trim() && !!p.last_name.trim() && !!p.phone.trim();

export const useStore = create<AppState>()((set, get) => ({
  user: null,
  items: [],
  events: [],
  cart: loadCart(),
  loading: false,
  profile: null,
  contactRequest: null,

  initAuth: async () => {
    try {
      const user = await adapter.getUser();
      set({ user, profile: null });
    } catch (e) {
      console.error(e);
      set({ user: null });
    }
  },

  signIn: async (email, pass) => {
    const user = await adapter.signIn(email, pass);
    set({ user, profile: null });
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
    set({ user: null, profile: null });
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

  loadProfile: async () => {
    const user = get().user;
    if (!user) return null;
    const profile = await adapter.getMyProfile(user.id);
    // Si mientras tanto se ha cambiado de cuenta, no se mezclan los datos
    if (get().user?.id === user.id) set({ profile });
    return profile;
  },

  saveProfile: async (profile) => {
    const user = get().user;
    if (!user) throw new Error('Inicia sesión para guardar tus datos.');
    await adapter.saveMyProfile(user.id, profile);
    set({ profile });
  },

  ensureContact: async () => {
    if (!get().user) return true;
    let profile = get().profile;
    if (!profile) {
      try { profile = await get().loadProfile(); }
      catch (e) {
        // Sin poder leer los datos no se bloquea la compra: el club tiene el email
        console.error('No se pudieron cargar los datos de contacto', e);
        return true;
      }
    }
    if (isProfileComplete(profile)) return true;
    get().contactRequest?.(false);
    return new Promise<boolean>(resolve => set({ contactRequest: resolve }));
  },

  answerContact: (ok) => {
    const resolve = get().contactRequest;
    set({ contactRequest: null });
    resolve?.(ok);
  },

  deleteAccount: async () => {
    await adapter.deleteOwnAccount();
    set({ user: null, profile: null, cart: [] });
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
