import { Modal } from './Modal';
import { Info } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export function MessageModal({ isOpen, onClose, title, message }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} icon={<Info size={22} />} maxWidth="500px">
      <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: '1.5', margin: '0 0 1rem 0' }}>
        {message}
      </p>
      <div className="modal-actions" style={{ borderTop: 'none', paddingTop: 0 }}>
        <button type="button" onClick={onClose} className="btn-modal-save">Entendido</button>
      </div>
    </Modal>
  );
}
