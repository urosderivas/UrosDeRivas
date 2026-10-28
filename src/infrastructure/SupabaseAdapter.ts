import { supabase } from '../utils/supabase';
import { registrationDetail } from '../utils/registrations';
import { AuthPort, MarketPort, EventPort, SystemLogPort, OrderPort } from '../application/ports';
import type { Role } from '../domain/roles';
import { User, UserProfile, MarketItem, Event, SystemLog, Order, Sponsor, NewsPost, OwnRegistration, EventCoupon } from '../domain/entities';

/** Registros de actividad que enseña el panel (los más recientes) */
const LOGS_SHOWN = 500;
const MAX_IMAGE_SIDE = 1600;

/**
 * Reduce una foto a como mucho 1600 px de lado y la guarda en WebP. Si no se
 * puede (formato raro, GIF animado) o no sale más pequeña, se sube la original.
 */
async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
    return blob && blob.type === 'image/webp' && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

// Sin 0/O ni 1/I/L, para que se puedan dictar y copiar a mano sin confusiones
const COUPON_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const COUPON_LENGTH = 6;

function randomCouponCode(): string {
  // Se descartan los bytes del final del rango para que todas las letras salgan igual de a menudo
  const limit = 256 - (256 % COUPON_ALPHABET.length);
  let code = '';
  while (code.length < COUPON_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(16))) {
      if (b < limit && code.length < COUPON_LENGTH) code += COUPON_ALPHABET[b % COUPON_ALPHABET.length];
    }
  }
  return code;
}

function couponSaveError(error: any): Error {
  const text = `${error?.message || ''} ${error?.details || ''}`;
  if (text.includes('event_coupons_price_check')) return new Error('El precio del cupón tiene que ser 0 (gratis) o al menos 0,50 €.');
  if (text.includes('event_coupons_note_check')) return new Error('La nota puede tener como mucho 120 caracteres.');
  return error instanceof Error ? error : new Error(error?.message || 'No se pudieron guardar los cupones.');
}

/** Errores de la base de datos al guardar un evento, en palabras para el admin. */
function eventSaveError(error: any): Error {
  const text = `${error?.message || ''} ${error?.details || ''}`;
  if (text.includes('events_price_table_check')) {
    return new Error('La tabla de precios está incompleta o no cuadra con las fechas. Revisa que todas las casillas tengan precio.');
  }
  if (text.includes('events_price_options_check')) {
    return new Error('Revisa los precios: cada opción necesita nombre y precio (si solo hay una, el nombre puede ir vacío).');
  }
  if (text.includes('events_type_check')) {
    return new Error('Este tipo de evento aún no está activado en la base de datos.');
  }
  return error instanceof Error ? error : new Error(error?.message || 'No se pudo guardar el evento.');
}

// Producto de la base de datos a producto de la web
const mapItem = (item: any): MarketItem => ({
  id: item.id,
  name: item.name,
  price: item.price,
  imageUrl: item.image_url,
  description: item.description,
  sizes: item.sizes,
  custom_fields: item.custom_fields || [],
  stripe_price_id: item.stripe_price_id,
  active: item.active !== false,
});

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
    return data.map(mapItem);
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
      active: item.active ?? true,
    }).select().single();
    if (error) throw error;
    return mapItem(data);
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
    if (item.active !== undefined) payload.active = item.active;

    const { data, error } = await supabase.from('market_items').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return mapItem(data);
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
      price_options: event.price_options ?? null,
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
    if (event.price_options !== undefined) payload.price_options = event.price_options;
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
      price_options: e.price_options ?? null,
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
      eventId: n.event_id || undefined, publishedAt: n.published_at, active: n.active !== false,
    }));
  }

  async saveNews(post: Omit<NewsPost, 'id'>, id?: string): Promise<void> {
    const payload: any = {
      title: post.title, body: post.body, image_url: post.imageUrl || null,
      event_id: post.eventId || null, published_at: post.publishedAt, active: post.active,
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
    // Las fotos del móvil pesan varios MB: se reducen antes de subirlas
    const upload = await shrinkImage(file);
    const ext = upload.type === 'image/webp' ? 'webp' : (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('media').upload(path, upload, { contentType: upload.type });
    if (error) throw error;
    return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
  }

  // ============================================
  // CAMPUS REGISTRATIONS
  // ============================================
  async getCampusRegistrations(eventId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_event_registrations', { target_event_id: eventId });
    if (error) { console.error('Error fetching registrations', error); return []; }
    // Enrich with registration details from the table (una cuenta puede tener varias en torneos)
    const { data: regs } = await supabase.from('event_registrations')
      .select('*')
      .eq('event_id', eventId);
    const regMap = (regs || []).reduce((acc: any, r: any) => { acc[r.id] = r; return acc; }, {});
    return (data || []).map((d: any) => {
      const r = regMap[d.registration_id] || {};
      return {
        ...d,
        id: d.registration_id,
        selected_days: r.selected_days || [],
        attendee_days: r.attendee_days || null,
        num_attendees: r.num_attendees || 1,
        attendee_names: r.attendee_names || [],
        amount: r.amount || 0,
        status: r.status || 'pending',
        stripe_session_id: r.stripe_session_id,
        custom_data: r.custom_data || {},
      };
    });
  }

  /** Asistentes inscritos por campus (sin canceladas). Vacío si la función aún no existe. */
  async getCampusOccupancy(): Promise<Record<string, number>> {
    const { data, error } = await supabase.rpc('get_campus_occupancy');
    if (error || !Array.isArray(data)) return {};
    const map: Record<string, number> = {};
    for (const r of data) map[r.event_id] = Number(r.taken) || 0;
    return map;
  }

  async getUserRegistrations(userId: string): Promise<OwnRegistration[]> {
    const { data, error } = await supabase.from('event_registrations')
      .select('id, event_id, status, attendee_names, amount, stripe_session_id, created_at')
      .eq('user_id', userId)
      .order('created_at');
    if (error) return [];
    return (data || []).map((r: any) => ({
      id: r.id, event_id: r.event_id, status: r.status, attendee_names: r.attendee_names || [],
      amount: Number(r.amount) || 0, stripe_session_id: r.stripe_session_id || null,
    }));
  }

  async getUserFullRegistrations(userId: string): Promise<any[]> {
    const { data, error } = await supabase.from('event_registrations')
      .select('*, events(title)')
      .eq('user_id', userId);
    if (error) return [];
    // map to match 'order' interface for the modal
    return data.map(r => ({
      id: r.id,
      event_id: r.event_id,
      buyer_name: '',
      buyer_email: '',
      item_name: r.events?.title || 'Campus',
      size: registrationDetail(r),
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

  async removeEventRegistration(registrationId: string): Promise<void> {
    const { error } = await supabase.from('event_registrations').delete().eq('id', registrationId);
    if (error) throw error;
  }

  async updateRegistrationStatus(registrationId: string, status: string): Promise<void> {
    const { error } = await supabase.rpc('update_registration_status', {
      p_registration_id: registrationId,
      p_status: status
    });
    if (error) throw error;
  }

  // ============================================
  // CUPONES (torneos y viajes)
  // ============================================
  async getCoupons(eventId: string): Promise<EventCoupon[]> {
    const { data, error } = await supabase.from('event_coupons')
      .select('id, event_id, code, price, note, created_at, stripe_session_id')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((c: any) => ({ ...c, price: Number(c.price) }));
  }

  /** Crea `count` códigos de un solo uso con el mismo precio final. */
  async createCoupons(eventId: string, count: number, price: number, note: string): Promise<EventCoupon[]> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const rows = Array.from({ length: count }, () => ({ event_id: eventId, code: randomCouponCode(), price, note: note.trim() || null }));
      const { data, error } = await supabase.from('event_coupons')
        .insert(rows)
        .select('id, event_id, code, price, note, created_at, stripe_session_id');
      // Un código repetido (muy raro) hace fallar el lote: se genera otro
      if (error?.code === '23505') continue;
      if (error) throw couponSaveError(error);
      return (data || []).map((c: any) => ({ ...c, price: Number(c.price) }));
    }
    throw new Error('No se pudieron generar los cupones. Vuelve a intentarlo.');
  }

  async deleteCoupon(id: string): Promise<void> {
    const { error } = await supabase.from('event_coupons').delete().eq('id', id);
    if (error) throw error;
  }

  async verifyPayment(sessionId: string): Promise<boolean> {
    const { data } = await supabase.from('orders').select('status').eq('stripe_session_id', sessionId).single();
    return data?.status === 'completed';
  }

  // ============================================
  // USER MANAGEMENT (RPCs)
  // ============================================
  async getSystemUsers(): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_system_users');
    if (error) { console.error('Error fetching users:', error); return []; }
    return data || [];
  }

  /** Cambia el rol de otro usuario (solo admins; nadie cambia el suyo). */
  async setUserRole(userId: string, role: Role): Promise<void> {
    const { error } = await supabase.rpc('set_user_role', { target_user_id: userId, new_role: role });
    if (error) throw error;
  }

  async deleteUser(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_user_account', { target_user_id: id });
    if (error) throw error;
  }

  // ============================================
  // MI CUENTA (nombre, apellidos y teléfono)
  // ============================================
  async getMyProfile(userId: string): Promise<UserProfile> {
    const { data, error } = await supabase.from('user_profiles')
      .select('first_name, last_name, phone').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data || { first_name: '', last_name: '', phone: '' };
  }

  async saveMyProfile(userId: string, profile: UserProfile): Promise<void> {
    const { error } = await supabase.from('user_profiles').upsert({ user_id: userId, ...profile });
    if (error) throw error;
  }

  /**
   * Datos de contacto por id de usuario. La base de datos solo devuelve los que puede ver
   * quien llama: el admin, todos; tienda, entrenador o fisio, los de sus clientes.
   */
  async getProfiles(userIds?: string[]): Promise<Record<string, UserProfile>> {
    const ids = userIds ? [...new Set(userIds.filter(Boolean))] : undefined;
    if (ids && ids.length === 0) return {};
    const out: Record<string, UserProfile> = {};
    // En trozos, para que la URL de la consulta no se haga demasiado larga
    const chunks = ids ? Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100)) : [undefined];
    for (const chunk of chunks) {
      let query = supabase.from('user_profiles').select('user_id, first_name, last_name, phone');
      if (chunk) query = query.in('user_id', chunk);
      const { data, error } = await query;
      if (error) { console.error('No se pudieron cargar los datos de contacto', error); return out; }
      for (const p of data || []) out[p.user_id] = { first_name: p.first_name, last_name: p.last_name, phone: p.phone };
    }
    return out;
  }

  /** Borra la cuenta de quien la usa (la base de datos no deja si tiene algo en curso). */
  async deleteOwnAccount(): Promise<void> {
    const { error } = await supabase.rpc('delete_own_account');
    if (error) throw error;
    await supabase.auth.signOut();
  }

  async getLogs(): Promise<SystemLog[]> {
    const { data, error } = await supabase.from('system_logs').select('*')
      .order('created_at', { ascending: false }).limit(LOGS_SHOWN);
    if (error) throw error;
    return data;
  }

  async deleteLog(id: string): Promise<void> {
    const { error } = await supabase.from('system_logs').delete().eq('id', id);
    if (error) throw error;
  }

  async createLog(actionType: string, metadata?: any): Promise<void> {
    // La RLS solo acepta logs de usuarios con sesión; sin sesión no se envía nada.
    // getSession lee la sesión guardada, sin pedirla otra vez al servidor.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const payload: any = { action_type: actionType, metadata, user_id: session.user.id };

    const { error } = await supabase.from('system_logs').insert(payload);
    // Silently fail for telemetry if needed, but log to console
    if (error) console.error("Telemetry error", error);
  }

  /** Todos los pedidos que puede ver quien llama (un admin, los de todos), o solo los de userId. */
  async getOrders(userId?: string): Promise<Order[]> {
    let query = supabase.from('orders').select(`
      *,
      market_items ( name )
    `);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query.order('created_at', { ascending: false });
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
  }> {
    const empty = { found: false, type: null as any, status: '', buyer_name: '', buyer_email: '', item_name: '', amount: 0, stripe_session_id: sessionId };

    // 1. Search in orders table
    const { data: orderData } = await supabase
      .from('orders')
      .select('*, market_items(name)')
      .eq('stripe_session_id', sessionId);

    if (orderData && orderData.length > 0) {
      // Un carrito son varias filas con la misma sesión: se enseña el pedido entero
      const o = orderData[0];
      const statuses = [...new Set(orderData.map((r: any) => r.status))];
      return {
        found: true,
        type: 'order',
        status: statuses.length === 1 ? statuses[0] : statuses.join(' / '),
        buyer_name: o.buyer_name,
        buyer_email: o.buyer_email,
        item_name: orderData.map((r: any) => `${r.quantity > 1 ? r.quantity + '× ' : ''}${r.market_items?.name || 'Producto'}`).join(', '),
        amount: orderData.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0),
        stripe_session_id: sessionId,
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
        item_name: `${r.events?.title || 'Campus'} [${registrationDetail(r)}]`,
        amount: r.amount || 0,
        stripe_session_id: sessionId,
      };
    }

    return empty;
  }
}
