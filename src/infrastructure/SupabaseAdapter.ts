import { supabase } from '../utils/supabase';
import { AuthPort, MarketPort, EventPort, SystemLogPort, OrderPort } from '../application/ports';
import { User, MarketItem, Event, SystemLog, Order, Sponsor, NewsPost } from '../domain/entities';

/** Errores de la base de datos al guardar un evento, en palabras para el admin. */
function eventSaveError(error: any): Error {
  const text = `${error?.message || ''} ${error?.details || ''}`;
  if (text.includes('events_price_table_check')) {
    return new Error('La tabla de precios está incompleta o no cuadra con las fechas. Revisa que todas las casillas tengan precio.');
  }
  if (text.includes('events_type_check')) {
    return new Error('Este tipo de evento aún no está activado en la base de datos.');
  }
  return error instanceof Error ? error : new Error(error?.message || 'No se pudo guardar el evento.');
}

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
    if (!userResult) throw new Error("No se pudo cargar tu perfil. Vuelve a intentarlo.");
    return userResult;
  }

  async signUp(email: string, password: string): Promise<void> {
    const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectUrl }
    });
    if (error) throw error;
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

  /** Envía el correo para elegir una contraseña nueva; el enlace vuelve a la portada. */
  async sendPasswordReset(email: string): Promise<void> {
    const redirectUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    if (error) throw error;
  }

  /** Cambia la contraseña de la sesión actual (la que abre el enlace del correo). */
  async updatePassword(password: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password });
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
    if (item.price !== undefined) payload.price = item.price;
    if (item.imageUrl !== undefined) payload.image_url = item.imageUrl || null;
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
    const { data, error } = await supabase.from('events').select('*').order('date', { ascending: false });
    if (error) throw error;
    return data.map((e: any) => this.mapEvent(e));
  }

  async createEvent(event: Omit<Event, 'id'>): Promise<Event> {
    const user = await this.getUser();
    const { data, error } = await supabase.from('events').insert({
      title: event.title,
      date: event.date,
      dates: event.dates || [],
      location: event.location,
      image_url: event.imageUrl,
      description: event.description,
      schedule: event.schedule,
      type: event.type || 'campus',
      price_per_day: event.price_per_day || 0,
      price_tiers: event.price_tiers || [],
      attendee_discounts: event.attendee_discounts || [],
      price_table: event.price_table ?? null,
      custom_fields: event.custom_fields || [],
      max_capacity: event.max_capacity,
      active: event.active !== false,
      created_by: user?.id,
    }).select().single();
    if (error) throw eventSaveError(error);
    return this.mapEvent(data);
  }

  async updateEvent(id: string, event: Partial<Event>): Promise<Event> {
    const payload: any = {};
    if (event.title !== undefined) payload.title = event.title;
    if (event.date !== undefined) payload.date = event.date;
    if (event.dates !== undefined) payload.dates = event.dates;
    if (event.location !== undefined) payload.location = event.location;
    if (event.imageUrl !== undefined) payload.image_url = event.imageUrl;
    if (event.description !== undefined) payload.description = event.description;
    if (event.schedule !== undefined) payload.schedule = event.schedule;
    if (event.price_per_day !== undefined) payload.price_per_day = event.price_per_day;
    if (event.price_tiers !== undefined) payload.price_tiers = event.price_tiers;
    if (event.attendee_discounts !== undefined) payload.attendee_discounts = event.attendee_discounts;
    if (event.price_table !== undefined) payload.price_table = event.price_table;
    if (event.custom_fields !== undefined) payload.custom_fields = event.custom_fields;
    if (event.max_capacity !== undefined) payload.max_capacity = event.max_capacity;
    if (event.active !== undefined) payload.active = event.active;
    if (event.type !== undefined) payload.type = event.type;

    const { data, error } = await supabase.from('events').update(payload).eq('id', id).select();
    if (error) throw eventSaveError(error);
    if (!data || data.length === 0) throw new Error('No se pudo actualizar el evento. Puede que no tengas permisos si no eres el creador.');
    
    return this.mapEvent(data[0]);
  }

  private mapEvent(e: any): Event {
    return {
      id: e.id, title: e.title, date: e.date, dates: e.dates || [],
      location: e.location, imageUrl: e.image_url, description: e.description,
      schedule: e.schedule, type: e.type === 'torneo' ? 'torneo' : 'campus',
      price_per_day: Number(e.price_per_day) || 0, price_tiers: e.price_tiers || [],
      attendee_discounts: e.attendee_discounts || [], price_table: e.price_table ?? null,
      custom_fields: e.custom_fields || [],
      max_capacity: e.max_capacity, active: e.active !== false,
    };
  }

  async deleteEvent(id: string): Promise<void> {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
  }

  // ============================================
  // SPONSORS & NEWS
  // ============================================
  async getSponsors(): Promise<Sponsor[]> {
    const { data, error } = await supabase.from('sponsors').select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data.map((s: any) => ({
      id: s.id, name: s.name, imageUrl: s.image_url, linkUrl: s.link_url || undefined,
      sortOrder: s.sort_order, active: s.active !== false,
    }));
  }

  async saveSponsor(sponsor: Omit<Sponsor, 'id'>, id?: string): Promise<void> {
    const payload = {
      name: sponsor.name, image_url: sponsor.imageUrl, link_url: sponsor.linkUrl || null,
      sort_order: sponsor.sortOrder, active: sponsor.active,
    };
    const { error } = id
      ? await supabase.from('sponsors').update(payload).eq('id', id)
      : await supabase.from('sponsors').insert(payload);
    if (error) throw error;
  }

  async deleteSponsor(id: string): Promise<void> {
    const { error } = await supabase.from('sponsors').delete().eq('id', id);
    if (error) throw error;
  }

  async getNews(): Promise<NewsPost[]> {
    const { data, error } = await supabase.from('news').select('*')
      .order('published_at', { ascending: false });
    if (error) throw error;
    return data.map((n: any) => ({
      id: n.id, title: n.title, body: n.body || '', imageUrl: n.image_url || undefined,
      eventId: n.event_id || undefined, publishedAt: n.published_at,
    }));
  }

  async saveNews(post: Omit<NewsPost, 'id'>, id?: string): Promise<void> {
    const payload: any = {
      title: post.title, body: post.body, image_url: post.imageUrl || null,
      event_id: post.eventId || null, published_at: post.publishedAt,
    };
    if (!id) payload.created_by = (await this.getUser())?.id;
    const { error } = id
      ? await supabase.from('news').update(payload).eq('id', id)
      : await supabase.from('news').insert(payload);
    if (error) throw error;
  }

  async deleteNews(id: string): Promise<void> {
    const { error } = await supabase.from('news').delete().eq('id', id);
    if (error) throw error;
  }

  /** Sube una imagen al bucket público "media" y devuelve su URL. */
  async uploadImage(file: File, folder: 'sponsors' | 'news' | 'events' | 'products'): Promise<string> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type });
    if (error) throw error;
    return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
  }

  // ============================================
  // CAMPUS REGISTRATIONS
  // ============================================
  async getCampusRegistrations(eventId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_event_registrations', { target_event_id: eventId });
    if (error) { console.error('Error fetching registrations', error); return []; }
    // Enrich with registration details from the table
    const { data: regs } = await supabase.from('event_registrations')
      .select('*')
      .eq('event_id', eventId);
    const regMap = (regs || []).reduce((acc: any, r: any) => { acc[r.user_id] = r; return acc; }, {});
    return (data || []).map((d: any) => ({
      ...d,
      selected_days: regMap[d.user_id]?.selected_days || [],
      num_attendees: regMap[d.user_id]?.num_attendees || 1,
      attendee_names: regMap[d.user_id]?.attendee_names || [],
      amount: regMap[d.user_id]?.amount || 0,
      status: regMap[d.user_id]?.status || 'pending',
      stripe_session_id: regMap[d.user_id]?.stripe_session_id,
      custom_data: regMap[d.user_id]?.custom_data || {},
    }));
  }

  /** Asistentes inscritos por campus (sin canceladas). Vacío si la función aún no existe. */
  async getCampusOccupancy(): Promise<Record<string, number>> {
    const { data, error } = await supabase.rpc('get_campus_occupancy');
    if (error || !Array.isArray(data)) return {};
    const map: Record<string, number> = {};
    for (const r of data) map[r.event_id] = Number(r.taken) || 0;
    return map;
  }

  async getUserRegistrations(userId: string): Promise<Record<string, string>> {
    const { data, error } = await supabase.from('event_registrations').select('event_id, status').eq('user_id', userId);
    if (error) return {};
    const map: Record<string, string> = {};
    for (const r of data) map[r.event_id] = r.status;
    return map;
  }

  async getUserFullRegistrations(userId: string): Promise<any[]> {
    const { data, error } = await supabase.from('event_registrations')
      .select('*, events(title)')
      .eq('user_id', userId);
    if (error) return [];
    // map to match 'order' interface for the modal
    return data.map(r => ({
      id: r.event_id + '_' + userId,
      event_id: r.event_id,
      buyer_name: '',
      buyer_email: '',
      item_name: r.events?.title || 'Campus',
      size: `${(r.attendee_names || []).join(', ')} | ${(r.selected_days || []).join(', ')}`,
      quantity: 1,
      amount: r.amount,
      status: r.status,
      stripe_session_id: r.stripe_session_id,
      created_at: r.created_at,
      type: 'campus'
    }));
  }

  async getEventAttendees(eventId: string): Promise<any[]> {
    return this.getCampusRegistrations(eventId);
  }

  async removeEventRegistration(eventId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('event_registrations').delete().match({ event_id: eventId, user_id: userId });
    if (error) throw error;
  }

  async updateRegistrationStatus(eventId: string, userId: string, status: string): Promise<void> {
    const { error } = await supabase.rpc('update_admin_campus_status', { 
      p_event_id: eventId, 
      p_user_id: userId, 
      p_status: status 
    });
    // Fallback if rpc hasn't been uploaded yet (which might fail silently or throw due to RLS)
    if (error) {
      console.warn("RPC update_admin_campus_status failed, trying direct update (may fail silently if RLS blocks):", error);
      const { error: err2 } = await supabase.from('event_registrations')
        .update({ status })
        .match({ event_id: eventId, user_id: userId });
      if (err2) throw err2;
    }
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

  async checkStripePaymentsBatch(sessionIds: string[]): Promise<Record<string, { payment_status: string; status: string }>> {
    if (sessionIds.length === 0) return {};
    const { data, error } = await supabase.functions.invoke('verify-payment', {
      body: { sessionIds } // Array mode supported by our new Edge layout
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
    // La RLS solo acepta logs de usuarios con sesión; sin sesión no se envía nada
    const user = await this.getUser();
    if (!user) return;
    const payload: any = { action_type: actionType, metadata, user_id: user.id };

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
      quantity: o.quantity || 1,
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
        quantity: ci.quantity,
        amount: 0,
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

  /**
   * Look up an order or campus registration by its stripe_session_id.
   * Used by the QR scanner verification flow.
   */
  async lookupByStripeSession(sessionId: string): Promise<{
    found: boolean;
    type: 'order' | 'campus' | null;
    status: string;
    buyer_name: string;
    buyer_email: string;
    item_name: string;
    amount: number;
    stripe_session_id: string;
    is_local: boolean;
  }> {
    const empty = { found: false, type: null as any, status: '', buyer_name: '', buyer_email: '', item_name: '', amount: 0, stripe_session_id: sessionId, is_local: false };

    // 1. Search in orders table
    const { data: orderData } = await supabase
      .from('orders')
      .select('*, market_items(name)')
      .eq('stripe_session_id', sessionId)
      .limit(1);

    if (orderData && orderData.length > 0) {
      const o = orderData[0];
      return {
        found: true,
        type: 'order',
        status: o.status,
        buyer_name: o.buyer_name,
        buyer_email: o.buyer_email,
        item_name: o.market_items?.name || 'Producto',
        amount: o.amount,
        stripe_session_id: sessionId,
        is_local: sessionId.startsWith('local_'),
      };
    }

    // 2. Search in event_registrations table
    const { data: regData } = await supabase
      .from('event_registrations')
      .select('*, events(title)')
      .eq('stripe_session_id', sessionId)
      .limit(1);

    if (regData && regData.length > 0) {
      const r = regData[0];
      // Get user email via RPC or auth lookup — we use the get_system_users approach
      let userEmail = '';
      try {
        const { data: users } = await supabase.rpc('get_system_users');
        const matched = users?.find((u: any) => u.id === r.user_id);
        if (matched) userEmail = matched.email || '';
      } catch {}

      return {
        found: true,
        type: 'campus',
        status: r.status,
        buyer_name: userEmail ? userEmail.split('@')[0] : (r.attendee_names?.[0] || 'Desconocido'),
        buyer_email: userEmail,
        item_name: r.events?.title || 'Campus',
        amount: r.amount || 0,
        stripe_session_id: sessionId,
        is_local: sessionId.startsWith('local_'),
      };
    }

    return empty;
  }
}
