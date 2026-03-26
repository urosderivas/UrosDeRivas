import { ReactNode } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ isOpen, onClose, title, icon, children, maxWidth = '680px' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} style={{ zIndex: 9999 }}>
      <div 
        className="modal-panel animate-scale-in" 
        onClick={e => e.stopPropagation()} 
        style={{ maxWidth }}
      >
        <div className="modal-header">
          {icon && <span className="modal-icon">{icon}</span>}
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
