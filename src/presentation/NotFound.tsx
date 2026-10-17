import { Link } from 'react-router-dom';
import './NotFound.css';

export function NotFound() {
  return (
    <div className="not-found">
      <img src={`${import.meta.env.BASE_URL}assets/navbar_black_bull.png`} alt="" className="not-found-logo" />
      <h1>404</h1>
      <p>Esta página no existe o se ha movido.</p>
      <Link to="/" className="btn-primary">Volver al inicio</Link>
    </div>
  );
}
