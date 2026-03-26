import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './CookieBanner.css';

export function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie_banner_accepted');
    if (!consent) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie_banner_accepted', 'true');
    setShowBanner(false);
  };

  const handleDecline = () => {
    // Para simplificar, consideramos cerrar como un rehuso temporal pero ocultamos la caja
    // O puedes guardar un valor false si quieres un control estricto.
    localStorage.setItem('cookie_banner_accepted', 'false');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="cookie-banner-overlay">
      <div className="cookie-banner">
        <div className="cookie-content">
          <h4>Uso de cookies</h4>
          <p>
            Utilizamos cookies propias y de terceros para asegurar el buen funcionamiento de la web, recordar tus preferencias y elaborar estadísticas de uso para mejorar tu experiencia.
            Puedes leer más en nuestra <Link to="/cookies">Política de cookies</Link>.
          </p>
        </div>
        <div className="cookie-actions">
          <button onClick={handleDecline} className="btn-decline">Rechazar no necesarias</button>
          <button onClick={handleAccept} className="btn-accept">Aceptar todas</button>
        </div>
      </div>
    </div>
  );
}
