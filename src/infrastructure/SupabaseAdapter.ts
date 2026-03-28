import { supabase } from '../utils/supabase';
import { AuthPort, MarketPort, EventPort, SystemLogPort, OrderPort } from '../application/ports';
import { User, MarketItem, Event, SystemLog, Order } from '../domain/entities';

export class SupabaseAdapter implements AuthPort, MarketPort, EventPort, SystemLogPort, OrderPort {
  async getUser(): Promise<User | null> {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    
    // Check if user is admin or coach via user_roles table
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    return {
      id: user.id,
      email: user.email!,
      role: roleRow?.role || 'user',
    };
  }

  async signIn(email: string, password: string): Promise<User> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error("No user returned");
    const userResult = await this.getUser();
    if (!userResult) throw new Error("Failed to get profile");
    return userResult;
  }

  async signInWithGoogle(): Promise<void> {
    // Determine the precise origin path considering GitHub Pages base url padding seamlessly
    const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  async getItems(): Promise<MarketItem[]> {
    const { data, error } = await supabase.from('market_items').select('*');
    if (error) throw error;
    // Map DB fields to Domain if necessary
    return data.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      imageUrl: item.image_url,
      description: item.description,
      sizes: item.sizes,
      custom_fields: item.custom_fields || [],
      stripe_price_id: item.stripe_price_id,
    }));
  }

  async createItem(item: Omit<MarketItem, 'id'>): Promise<MarketItem> {
    const { data, error } = await supabase.from('market_items').insert({
      name: item.name,
      price: item.price,
      image_url: item.imageUrl,
      description: item.description,
      sizes: item.sizes || [],
      custom_fields: item.custom_fields || [],
      stripe_price_id: item.stripe_price_id,
    }).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, price: data.price, imageUrl: data.image_url, description: data.description, sizes: data.sizes, custom_fields: data.custom_fields, stripe_price_id: data.stripe_price_id };
  }

  async updateItem(id: string, item: Partial<MarketItem>): Promise<MarketItem> {
    const payload: any = {};
    if (item.name) payload.name = item.name;
    if (item.price) payload.price = item.price;
    if (item.imageUrl) payload.image_url = item.imageUrl;
    if (item.description !== undefined) payload.description = item.description;
    if (item.sizes !== undefined) payload.sizes = item.sizes;
    if (item.custom_fields !== undefined) payload.custom_fields = item.custom_fields;
    if (item.stripe_price_id !== undefined) payload.stripe_price_id = item.stripe_price_id;

    const { data, error } = await supabase.from('market_items').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return { id: data.id, name: data.name, price: data.price, imageUrl: data.image_url, description: data.description, sizes: data.sizes, custom_fields: data.custom_fields, stripe_price_id: data.stripe_price_id };
  }

  async deleteItem(id: string): Promise<void> {
    const { error } = await supabase.from('market_items').delete().eq('id', id);
    if (error) throw error;
  }

  async getEvents(): Promise<Event[]> {
    const { data, error } = await supabase.from('events').select('*');
    if (error) throw error;
    return data.map(e => ({
      id: e.id,
      title: e.title,
      date: e.date,
      location: e.location,
      imageUrl: e.image_url,
      description: e.description,
      type: e.type,
    }));
  }

  async createEvent(event: Omit<Event, 'id'>): Promise<Event> {
    const user = await this.getUser();
    const { data, error } = await supabase.from('events').insert({
      title: event.title,
      date: event.date,
      location: event.location,
      image_url: event.imageUrl,
      description: event.description,
      type: event.type,
      created_by: user?.id,
    }).select().single();
    if (error) throw error;
    return { id: data.id, title: data.title, date: data.date, location: data.location, imageUrl: data.image_url, description: data.description, type: data.type };
  }

  async updateEvent(id: string, event: Partial<Event>): Promise<Event> {
    const payload: any = {};
    if (event.title) payload.title = event.title;
    if (event.date) payload.date = event.date;
    if (event.location) payload.location = event.location;
    if (event.imageUrl) payload.image_url = event.imageUrl;
    if (event.description) payload.description = event.description;
    if (event.type) payload.type = event.type;

    const { data, error } = await supabase.from('events').update(payload).eq('id', id).select().single();
    if (error) throw error;
    // Map back
    return { id: data.id, title: data.title, date: data.date, location: data.location, imageUrl: data.image_url, description: data.description, type: data.type };
  }

  async deleteEvent(id: string): Promise<void> {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
  }

  // ============================================
  // EVENT REGISTRATIONS
  // ============================================
  async toggleEventRegistration(eventId: string, userId: string, isRegistered: boolean): Promise<void> {
    if (isRegistered) {
      const { error } = await supabase.from('event_registrations').delete().match({ event_id: eventId, user_id: userId });
      if (error) throw error;
    } else {
      const { error } = await supabase.from('event_registrations').insert({ event_id: eventId, user_id: userId });
      if (error) throw error;
    }
  }

  async getUserRegistrations(userId: string): Promise<string[]> {
    const { data, error } = await supabase.from('event_registrations').select('event_id').eq('user_id', userId);
    if (error) return [];
    return data.map(r => r.event_id);
  }

  async getEventAttendees(eventId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_event_registrations', { target_event_id: eventId });
    if (error) { console.error('Error fetching attendees', error); return []; }
    return data || [];
  }

  async removeEventRegistration(eventId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('event_registrations').delete().match({ event_id: eventId, user_id: userId });
    if (error) throw error;
  }

  async verifyPayment(sessionId: string): Promise<boolean> {
    const { data } = await supabase.from('orders').select('status').eq('stripe_session_id', sessionId).single();
    return data?.status === 'completed';
  }

  async checkStripePayment(sessionId: string): Promise<{ payment_status: string; status: string }> {
    const { data, error } = await supabase.functions.invoke('verify-payment', {
      body: { sessionId }
    });
    if (error) throw error;
    return data;
  }

  // ============================================
  // USER MANAGEMENT (RPCs)
  // ============================================
  async getSystemUsers(): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_system_users');
    if (error) { console.error('Error fetching users:', error); return []; }
    return data || [];
  }

  async deleteUser(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_user_account', { target_user_id: id });
    if (error) throw error;
  }

  async getLogs(): Promise<SystemLog[]> {
    const { data, error } = await supabase.from('system_logs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async deleteLog(id: string): Promise<void> {
    const { error } = await supabase.from('system_logs').delete().eq('id', id);
    if (error) throw error;
  }

  async createLog(actionType: string, metadata?: any): Promise<void> {
    const user = await this.getUser();
    const payload: any = { action_type: actionType, metadata };
    if (user) payload.user_id = user.id;

    const { error } = await supabase.from('system_logs').insert(payload);
    // Silently fail for telemetry if needed, but log to console
    if (error) console.error("Telemetry error", error);
  }

  async getOrders(): Promise<Order[]> {
    const { data, error } = await supabase.from('orders').select(`
      *,
      market_items ( name )
    `).order('created_at', { ascending: false });
    if (error) throw error;
    
    return data.map((o: any) => ({
      id: o.id,
      user_id: o.user_id,
      buyer_name: o.buyer_name,
      buyer_email: o.buyer_email,
      item_id: o.item_id,
      item_name: o.market_items?.name || 'Producto Eliminado',
      size: o.size,
      status: o.status,
      amount: o.amount,
      stripe_session_id: o.stripe_session_id,
      created_at: o.created_at
    }));
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    const { data, error } = await supabase.from('orders').update({ status }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }

  async deleteOrder(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_admin_order', { target_order_id: id });
    if (error) throw error;
  }

  async createOrderLocal(items: { itemId: string; quantity: number; options: Record<string, string> }[], userEmail: string): Promise<void> {
    const user = await this.getUser();
    if (!user) throw new Error("Debes iniciar sesión.");

    const sessionId = `local_${crypto.randomUUID().substring(0, 8)}`;
    const rows = items.map(ci => {
      const textOptionsStr = Object.entries(ci.options || {}).map(([k,v]) => `${k}: ${v}`).join(' | ');
      return {
        user_id: user.id,
        buyer_name: user.email.split('@')[0],
        buyer_email: userEmail,
        item_id: ci.itemId,
        size: textOptionsStr || null,
        amount: 0, // Will be resolved from item price
        status: 'pending',
        stripe_session_id: sessionId
      };
    });

    // Fetch actual prices from DB for security
    const itemIds = items.map(i => i.itemId);
    const { data: dbItems } = await supabase.from('market_items').select('id, price').in('id', itemIds);
    if (dbItems) {
      const priceMap = new Map(dbItems.map((i: any) => [i.id, i.price]));
      for (let i = 0; i < rows.length; i++) {
        rows[i].amount = (priceMap.get(items[i].itemId) || 0) * items[i].quantity;
      }
    }

    const { error } = await supabase.from('orders').insert(rows);
    if (error) throw new Error("Error creando pedido: " + error.message);
  }
}
