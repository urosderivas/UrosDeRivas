import './Footer.css';

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-brand">
          <img src="https://www.urosderivas.com/logo.png" alt="Uros de Rivas" className="footer-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <h3>CLUB DEPORTIVO ELEMENTAL UROS DE RIVAS</h3>
        </div>
        <div className="footer-links">
          <span>Condiciones de uso y aviso legal</span>
          <span>Protección de datos</span>
          <span>Política de cookies</span>
        </div>
        <div className="footer-copy">
          Copyright © 2026 Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
}
