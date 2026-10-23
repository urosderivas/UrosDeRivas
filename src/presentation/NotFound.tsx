import { Link } from 'react-router-dom';
import './NotFound.css';
import { clubLogoUrl } from '../utils/media';

export function NotFound() {
  return (
    <div className="not-found">
      <img src={clubLogoUrl} alt="" className="not-found-logo" />
      <h1>404</h1>
      <p>Esta página no existe o se ha movido.</p>
      <Link to="/" className="btn-primary">Volver al inicio</Link>
    </div>
  );
}
