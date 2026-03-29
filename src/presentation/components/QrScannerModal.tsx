import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Modal } from './Modal';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResult: (qrData: string) => void;
}

export function QrScannerModal({ isOpen, onClose, onResult }: QrScannerModalProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const containerId = 'qr-reader-container';

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const startScanner = async () => {
      // Small delay for DOM to settle
      await new Promise(r => setTimeout(r, 300));
      if (!mounted) return;

      try {
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;
        setScanning(true);
        setError(null);

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            // On success — stop scanner and return result
            scanner.stop().then(() => {
              scannerRef.current = null;
              setScanning(false);
              onResult(decodedText);
            }).catch(() => {});
          },
          () => {
            // QR scan failure callback — ignore (just means no QR in frame)
          }
        );
      } catch (err: any) {
        if (mounted) {
          setError(err?.message || 'No se pudo acceder a la cámara. Asegúrate de dar permiso.');
          setScanning(false);
          scannerRef.current = null; // Clear if it failed to start
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      setScanning(false);
    };
  }, [isOpen]);

  const handleClose = async () => {
    try {
      if (scannerRef.current && scanning) {
        await scannerRef.current.stop();
      }
    } catch (err) {
      console.warn("Scanner stop error:", err);
    } finally {
      // Guaranteed to run
      if (scannerRef.current) scannerRef.current = null;
      setScanning(false);
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="📷 Escanear Factura QR">
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '16px' }}>
          Apunta la cámara al código QR de la factura del cliente para verificar el estado de pago.
        </p>

        <div
          id={containerId}
          style={{
            width: '100%',
            maxWidth: '400px',
            margin: '0 auto',
            borderRadius: '12px',
            overflow: 'hidden',
            background: '#111',
            minHeight: '300px',
          }}
        />

        {scanning && (
          <p style={{ color: '#d4af37', marginTop: '12px', fontSize: '0.85rem' }}>
            🔍 Buscando código QR...
          </p>
        )}

        {error && (
          <div style={{
            background: 'rgba(229,57,53,0.15)',
            border: '1px solid #e53935',
            borderRadius: '10px',
            padding: '12px',
            marginTop: '12px',
            color: '#ff6b6b',
            fontSize: '0.9rem',
          }}>
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={handleClose}
          style={{
            marginTop: '16px',
            padding: '10px 24px',
            background: 'rgba(255,255,255,0.1)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          Cerrar escáner
        </button>
      </div>
    </Modal>
  );
}
