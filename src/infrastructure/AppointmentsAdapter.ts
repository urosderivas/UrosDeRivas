import { supabase } from '../utils/supabase';
import { Appointment, AppointmentBlock, AppointmentProvider, AppointmentStatus, DayHours } from '../domain/entities';

/** Mensajes en español para los fallos que la base de datos da en inglés. */
function friendly(error: any): Error {
  const msg: string = error?.message || 'Error desconocido';
  if (msg.includes('appointment_providers_user_id_key')) return new Error('Esa persona ya tiene un calendario.');
  if (msg.includes('appointment_providers_hours_check')) return new Error('Revisa el horario: cada tramo tiene que empezar antes de acabar.');
  if (msg.includes('appointment_day_hours_ranges_check')) return new Error('Revisa el horario: cada tramo tiene que empezar antes de acabar y no solaparse.');
  if (msg.includes('appointment_providers_price_check')) return new Error('El precio tiene que estar entre 0 y 1000 €.');
  if (msg.includes('appointment_blocks_range_check')) return new Error('El bloqueo tiene que acabar después de empezar (y durar como mucho 120 días).');
  if (msg.includes('row-level security')) return new Error('No tienes permiso para hacer esto.');
  return new Error(msg);
}

const PROVIDER_COLUMNS = 'id, user_id, name, service, description, duration_minutes, weekly_hours, min_notice_hours, max_days_ahead, cancel_hours, active, price';

export type ProviderDraft = Omit<AppointmentProvider, 'id'>;

/** Citas de fisio y recuperación (tablas appointment_*; ver la migración de citas). */
export class AppointmentsAdapter {
  /** Calendarios visibles: los activos para todos; además, los propios o todos para fisio y admin. */
  async getProviders(): Promise<AppointmentProvider[]> {
    const { data, error } = await supabase.from('appointment_providers').select(PROVIDER_COLUMNS).order('service').order('name');
    if (error) throw friendly(error);
    return (data || []) as AppointmentProvider[];
  }

  async createProvider(draft: ProviderDraft): Promise<AppointmentProvider> {
    const { data, error } = await supabase.from('appointment_providers').insert(draft).select(PROVIDER_COLUMNS).single();
    if (error) throw friendly(error);
    return data as AppointmentProvider;
  }

  async updateProvider(id: string, changes: Partial<ProviderDraft>): Promise<AppointmentProvider> {
    const { data, error } = await supabase.from('appointment_providers').update(changes).eq('id', id).select(PROVIDER_COLUMNS).single();
    if (error) throw friendly(error);
    return data as AppointmentProvider;
  }

  async deleteProvider(id: string): Promise<void> {
    const { error } = await supabase.from('appointment_providers').delete().eq('id', id);
    if (error) throw friendly(error);
  }

  /** Huecos libres entre dos días de Madrid ("2026-11-01"). */
  async getAvailableSlots(providerId: string, from: string, to: string): Promise<string[]> {
    const { data, error } = await supabase.rpc('get_available_slots', { p_provider_id: providerId, p_from: from, p_to: to });
    if (error) throw friendly(error);
    return (data || []).map((r: any) => r.starts_at);
  }

  /** El fisio o un admin apuntan una cita desde el panel (sin dueño y sin pago online). */
  async addByStaff(providerId: string, startsAt: string, patientName: string, notes: string): Promise<string> {
    const { data, error } = await supabase.rpc('add_staff_appointment', {
      p_provider_id: providerId, p_starts_at: startsAt, p_patient_name: patientName, p_notes: notes || null,
    });
    if (error) throw friendly(error);
    return data as string;
  }

  /** Cita gratis reservada desde la página Citas (las de pago van por StripeAdapter). */
  async book(providerId: string, startsAt: string, patientName: string, notes: string): Promise<string> {
    const { data, error } = await supabase.rpc('book_appointment', {
      p_provider_id: providerId, p_starts_at: startsAt, p_patient_name: patientName, p_notes: notes || null,
    });
    if (error) throw friendly(error);
    return data as string;
  }

  /** Mis citas (las que reservé yo), con el calendario de cada una. */
  async getMyAppointments(userId: string): Promise<Appointment[]> {
    const { data, error } = await supabase.from('appointments')
      .select('*, provider:appointment_providers(name, service, cancel_hours)')
      .eq('user_id', userId)
      .order('starts_at', { ascending: false })
      .limit(50);
    if (error) throw friendly(error);
    return (data || []) as Appointment[];
  }

  /** Agenda de un calendario entre dos instantes (para el fisio o un admin). */
  async getAgenda(providerId: string, from: Date, to: Date): Promise<Appointment[]> {
    const { data, error } = await supabase.from('appointments')
      .select('*')
      .eq('provider_id', providerId)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at');
    if (error) throw friendly(error);
    return (data || []) as Appointment[];
  }

  async cancel(appointmentId: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_appointment', { p_appointment_id: appointmentId });
    if (error) throw friendly(error);
  }

  async setStatus(appointmentId: string, status: AppointmentStatus): Promise<void> {
    const { error } = await supabase.rpc('set_appointment_status', { p_appointment_id: appointmentId, p_status: status });
    if (error) throw friendly(error);
  }

  /** Días con horario propio entre dos días de Madrid (ambos incluidos), por día ("2026-11-03"). */
  async getDayHours(providerId: string, from: string, to: string): Promise<DayHours> {
    const { data, error } = await supabase.from('appointment_day_hours')
      .select('day, ranges')
      .eq('provider_id', providerId)
      .gte('day', from)
      .lte('day', to);
    if (error) throw friendly(error);
    return Object.fromEntries((data || []).map((r: any) => [r.day, r.ranges]));
  }

  /** Guarda el horario de varios días: null = vuelve al horario semanal. */
  async saveDayHours(providerId: string, days: Record<string, [string, string][] | null>): Promise<void> {
    const reset = Object.keys(days).filter(d => days[d] === null);
    const upsert = Object.keys(days).filter(d => days[d] !== null).map(day => ({ provider_id: providerId, day, ranges: days[day] }));
    if (upsert.length) {
      const { error } = await supabase.from('appointment_day_hours').upsert(upsert, { onConflict: 'provider_id,day' });
      if (error) throw friendly(error);
    }
    if (reset.length) {
      const { error } = await supabase.from('appointment_day_hours').delete().eq('provider_id', providerId).in('day', reset);
      if (error) throw friendly(error);
    }
  }

  /** Bloqueos que aún no han terminado. */
  async getBlocks(providerId: string): Promise<AppointmentBlock[]> {
    const { data, error } = await supabase.from('appointment_blocks')
      .select('id, provider_id, starts_at, ends_at, note')
      .eq('provider_id', providerId)
      .gte('ends_at', new Date().toISOString())
      .order('starts_at');
    if (error) throw friendly(error);
    return (data || []) as AppointmentBlock[];
  }

  async addBlock(providerId: string, startsAt: Date, endsAt: Date, note: string): Promise<void> {
    const { error } = await supabase.from('appointment_blocks').insert({
      provider_id: providerId, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), note: note.trim() || null,
    });
    if (error) throw friendly(error);
  }

  async deleteBlock(id: string): Promise<void> {
    const { error } = await supabase.from('appointment_blocks').delete().eq('id', id);
    if (error) throw friendly(error);
  }
}
