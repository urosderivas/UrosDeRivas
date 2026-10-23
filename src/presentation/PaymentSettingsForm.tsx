import { useEffect, useState } from 'react';
import { PaymentAdapter, PaymentSettings } from '../infrastructure/PaymentAdapter';
import { TransferDetails } from './components/TransferDetails';
import './components/Modal.css';

const payments = new PaymentAdapter();

/** Datos de la cuenta del club que ven quienes compran o se inscriben (y que llegan en el email). */
export function PaymentSettingsForm() {
  const [form, setForm] = useState<PaymentSettings>({ iban: '', holder: '', note: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    payments.getSettings().then(setForm).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const set = (key: keyof PaymentSettings, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setMessage('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');
    const iban = form.iban.replace(/\s+/g, ' ').trim().toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9 ]{10,40}$/.test(iban)) { setError('Revisa el IBAN: empieza por ES y dos números, p. ej. ES12 3456 7890 1234 5678 9012.'); return; }
    if (!form.holder.trim()) { setError('Pon el titular de la cuenta.'); return; }
    setSaving(true);
    try {
      const clean = { iban, holder: form.holder.trim(), note: form.note.trim() };
      await payments.saveSettings(clean);
      setForm(clean);
      setMessage('Guardado. Desde ahora se enseñan estos datos al comprar y al inscribirse.');
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar.');
    }
    setSaving(false);
  };

  if (loading) return <p className="table-empty">Cargando...</p>;

  return (
    <div className="admin-table-container" style={{ maxWidth: '640px' }}>
      <h3 style={{ marginBottom: '0.5rem' }}>Datos para las transferencias</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
        Todo se paga por transferencia. Al comprar, inscribirse o reservar una cita de pago se enseñan estos datos
        y se mandan por email, con un concepto único (UROS-...). Cuando llegue el dinero al banco, búscalo por el
        concepto y márcalo como pagado en Pedidos, Eventos o Citas.
      </p>
      {!form.iban && <p className="modal-error" style={{ marginBottom: '1rem' }}>Mientras no haya IBAN no se puede comprar ni inscribirse en nada de pago.</p>}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="form-group">
          <label>IBAN</label>
          <input value={form.iban} maxLength={50} onChange={e => set('iban', e.target.value)} placeholder="ES12 3456 7890 1234 5678 9012" />
        </div>
        <div className="form-group">
          <label>Titular</label>
          <input value={form.holder} maxLength={120} onChange={e => set('holder', e.target.value)} placeholder="Club Deportivo Elemental Uros de Rivas" />
        </div>
        <div className="form-group">
          <label>Nota <span className="label-hint">(opcional)</span></label>
          <textarea rows={3} value={form.note} maxLength={500} onChange={e => set('note', e.target.value)}
            placeholder="P. ej. Si tienes dudas, escribe a administracion@urosderivas.com" />
        </div>
        {error && <p className="modal-error">{error}</p>}
        {message && <p style={{ color: 'var(--success-text)' }}>{message}</p>}
        <button type="submit" className="btn-modal-save" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
      {form.iban && (
        <>
          <h4 style={{ margin: '2rem 0 0.75rem' }}>Así lo verán</h4>
          <TransferDetails info={{ ...form, reference: 'UROS-4F7K2Q', amount: 150 }} />
        </>
      )}
    </div>
  );
}
