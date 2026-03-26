import { Link } from 'react-router-dom';
import { useStore } from './store';
import { Menu, X, User } from 'lucide-react';
import { useState } from 'react';
import './Navbar.css';

export function Navbar() {
  const { user, signOut } = useStore();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-brand">
          <img src={`${import.meta.env.BASE_URL}assets/navbar_black_bull.png`} alt="Uros de Rivas" className="nav-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span>UROS DE RIVAS</span>
        </Link>
        
        <div className={`nav-links ${isOpen ? 'open' : ''}`}>
          <Link to="/" onClick={() => setIsOpen(false)}>INICIO</Link>
          <Link to="/events" onClick={() => setIsOpen(false)}>EVENTOS</Link>
          <Link to="/market" onClick={() => setIsOpen(false)}>TIENDA</Link>
          <Link to="/clasificaciones" onClick={() => setIsOpen(false)}>CLASIFICACIONES</Link>
          {user && (user.role === 'admin' || user.role === 'coach') && (
            <Link to="/admin" onClick={() => setIsOpen(false)}>ESTADÍSTICAS</Link>
          )}
          
          {user ? (
            <div className="auth-box">
              {user.role !== 'user' && (
                <span className={`user-badge role-${user.role}`}>
                  {user.role === 'admin' ? 'Admin' : 'Entrenador'}
                </span>
              )}
              <button onClick={() => { signOut(); setIsOpen(false); }} className="btn-logout">Salir</button>
            </div>
          ) : (
            <Link to="/login" onClick={() => setIsOpen(false)} className="btn-login">
              <User size={18} /> Entrar
            </Link>
          )}
        </div>

        <button className="mobile-toggle" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
    </nav>
  );
}
