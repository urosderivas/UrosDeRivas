import { useState } from 'react';
import type { UserProfile } from '../../domain/entities';
import { normalizePhone, phoneError } from '../../utils/profile';

interface Props {
  initial: UserProfile;
  submitLabel: string;
  onSubmit: (profile: UserProfile) => Promise<void>;
  /** Antes de pagar hacen falta los tres; en Mi cuenta se puede dejar alguno vacío */
  requireAll?: boolean;
  onCancel?: () => void;
}

/** Nombre, apellidos y teléfono: en Mi cuenta y en el recuadro que sale antes de pagar. */
export function ContactForm({ initial, submitLabel, onSubmit, requireAll, onCancel }: Props) {
  const [firstName, setFirstName] = useState(initial.first_name);
  const [lastName, setLastName] = useState(initial.last_name);
  const [phone, setPhone] = useState(initial.phone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const profile: UserProfile = {
      first_name: firstName.trim().replace(/\s+/g, ' '),
      last_name: lastName.trim().replace(/\s+/g, ' '),
      phone: normalizePhone(phone),
    };
    if (requireAll && (!profile.first_name || !profile.last_name || !profile.phone)) {
      setError('Rellena tu nombre, tus apellidos y tu teléfono.');
      return;
    }
    const phoneProblem = phone.trim() && !profile.phone ? 'Escribe el teléfono con números.' : phoneError(profile.phone);
    if (phoneProblem) { setError(phoneProblem); return; }

    setSaving(true); setError(''); setSaved(false);
    try {
      await onSubmit(profile);
      setPhone(profile.phone);
      setSaved(true);
    } catch (err: any) {
      setError(`No se pudieron guardar tus datos: ${err.message}`);
    }
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="contact-form" noValidate>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="contact-first-name">Nombre</label>
          <input id="contact-first-name" value={firstName} maxLength={60} autoComplete="given-name"
            onChange={e => { setFirstName(e.target.value); setSaved(false); }} />
        </div>
        <div className="form-group">
          <label htmlFor="contact-last-name">Apellidos</label>
          <input id="contact-last-name" value={lastName} maxLength={100} autoComplete="family-name"
            onChange={e => { setLastName(e.target.value); setSaved(false); }} />
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="contact-phone">Teléfono</label>
        <input id="contact-phone" type="tel" inputMode="tel" value={phone} maxLength={25} autoComplete="tel"
          placeholder="600 123 456" onChange={e => { setPhone(e.target.value); setSaved(false); }} />
      </div>
      {error && <p className="modal-error">{error}</p>}
      <div className="contact-form-actions">
        {saved && !error && <span className="contact-saved">Guardado ✓</span>}
        {onCancel && <button type="button" className="btn-modal-cancel" onClick={onCancel}>Cancelar</button>}
        <button type="submit" className="btn-modal-save" disabled={saving}>{saving ? 'Guardando...' : submitLabel}</button>
      </div>
    </form>
  );
}
