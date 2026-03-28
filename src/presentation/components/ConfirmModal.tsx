import { Modal } from './Modal';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ isOpen, title, message, onConfirm, onCancel }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <div style={{ padding: '1rem', color: '#ccc', textAlign: 'center' }}>
        <p style={{ marginBottom: '1.5rem', fontSize: '1.1rem', lineHeight: '1.5' }}>{message}</p>
        <div className="modal-actions" style={{ borderTop: 'none', paddingTop: 0, justifyContent: 'center', marginTop: '1rem' }}>
          <button className="btn-modal-cancel" onClick={onCancel} style={{ flex: '1' }}>CANCELAR</button>
          <button className="btn-modal-save" style={{ background: 'linear-gradient(135deg, #e53e3e, #c53030)', flex: '1', color: '#fff' }} onClick={() => { onConfirm(); onCancel(); }}>CONFIRMAR</button>
        </div>
      </div>
    </Modal>
  );
}
