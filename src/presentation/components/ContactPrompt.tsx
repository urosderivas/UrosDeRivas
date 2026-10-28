import { Phone } from 'lucide-react';
import { useStore } from '../store';
import { Modal } from './Modal';
import { ContactForm } from './ContactForm';
import '../Account.css';

/**
 * Recuadro que sale antes de comprar, inscribirse o reservar si la cuenta no tiene
 * nombre, apellidos o teléfono: el club los necesita para avisar de cada pedido.
 */
export function ContactPrompt() {
  const { contactRequest, profile, saveProfile, answerContact } = useStore();
  if (!contactRequest) return null;

  return (
    <Modal isOpen onClose={() => answerContact(false)} title="Tus datos de contacto" icon={<Phone size={22} />} maxWidth="520px">
      <p className="account-intro">
        Para seguir, pon tu nombre y un teléfono: el club los usa solo para avisarte de tu pedido o inscripción.
        Se guardan en <b>Mi cuenta</b> y no te los volveremos a pedir.
      </p>
      <ContactForm
        initial={profile || { first_name: '', last_name: '', phone: '' }}
        submitLabel="Guardar y seguir"
        requireAll
        onCancel={() => answerContact(false)}
        onSubmit={async p => { await saveProfile(p); answerContact(true); }}
      />
    </Modal>
  );
}
