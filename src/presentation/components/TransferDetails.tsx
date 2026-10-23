import { useState } from 'react';
import { Copy, Check, Landmark } from 'lucide-react';
import { Modal } from './Modal';
import { TransferInfo } from '../../infrastructure/PaymentAdapter';
import './TransferDetails.css';

const euros = (v: number) =>
  `${v.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })} €`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* sin portapapeles: se puede seleccionar el texto */ }
  };
  return (
    <button type="button" className="transfer-copy" onClick={copy} aria-label="Copiar">
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

/** Datos para hacer la transferencia: importe, IBAN, titular y concepto, con botones de copiar. */
export function TransferDetails({ info }: { info: TransferInfo }) {
  const rows: [string, string, boolean][] = [
    ['Importe', euros(info.amount), false],
    ['IBAN', info.iban, true],
    ['Titular', info.holder, false],
    ['Concepto', info.reference, true],
  ];
  return (
    <div className="transfer-details">
      {rows.filter(([, value]) => value).map(([label, value, copyable]) => (
        <div key={label} className="transfer-row">
          <span className="transfer-label">{label}</span>
          <span className="transfer-value">{value}</span>
          {copyable && <CopyButton text={value.replace(/\s/g, '')} />}
        </div>
      ))}
      {info.note && <p className="transfer-note">{info.note}</p>}
    </div>
  );
}

interface ModalProps {
  result: { transfer: TransferInfo; emailSent: boolean } | null;
  onClose: () => void;
  /** Qué se ha reservado, para el título: "pedido", "inscripción", "cita" */
  what: string;
}

/** Aviso al terminar una compra, inscripción o cita de pago: cómo completar la transferencia. */
export function TransferModal({ result, onClose, what }: ModalProps) {
  return (
    <Modal isOpen={result !== null} onClose={onClose} title={`Completa tu ${what}`} icon={<Landmark size={22} />} maxWidth="520px">
      {result && (
        <>
          <p className="transfer-intro">
            Haz una transferencia con estos datos. Pon el concepto tal cual, así el club sabe a qué corresponde tu pago.
          </p>
          <TransferDetails info={result.transfer} />
          <p className="transfer-intro">
            {result.emailSent ? 'También te lo hemos enviado por email. ' : ''}
            Tu {what} queda pendiente hasta que el club reciba la transferencia. Puedes volver a ver estos datos en «Mis pedidos».
          </p>
          <div className="modal-actions" style={{ borderTop: 'none', paddingTop: 0, justifyContent: 'center' }}>
            <button type="button" onClick={onClose} className="btn-modal-save" style={{ flex: '1' }}>ENTENDIDO</button>
          </div>
        </>
      )}
    </Modal>
  );
}
