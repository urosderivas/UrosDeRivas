import { Link } from 'react-router-dom';
import { useStore } from './store';
import { Menu, X, User, UserRound, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { AccountModal } from './AccountModal';
import './Navbar.css';
import { clubLogoUrl } from '../utils/media';
import { isStaff, ROLE_LABELS } from '../domain/roles';
import { ThemeToggle } from './components/ThemeToggle';
import { FEATURES } from '../config';

export function Navbar() {
  const { user, signOut, cart } = useStore();
  const cartCount = cart.reduce((n, c) => n + c.quantity, 0);
  const [isOpen, setIsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <>
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-brand">
          <img src={clubLogoUrl} alt="Uros de Rivas" className="nav-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span>UROS DE RIVAS</span>
        </Link>
        
        <div className={`nav-links ${isOpen ? 'open' : ''}`}>
          <Link to="/" onClick={() => setIsOpen(false)}>INICIO</Link>
          <Link to="/events" onClick={() => setIsOpen(false)}>CAMPUS</Link>
          <Link to="/torneos" onClick={() => setIsOpen(false)}>TORNEOS Y VIAJES</Link>
          <Link to="/market" onClick={() => setIsOpen(false)}>TIENDA</Link>
          {FEATURES.appointments && <Link to="/citas" onClick={() => setIsOpen(false)}>CITAS</Link>}
          <Link to="/sponsors" onClick={() => setIsOpen(false)}>PATROCINADORES</Link>
          {isStaff(user?.role) && (
            <Link to="/admin" onClick={() => setIsOpen(false)}>ADMIN</Link>
          )}
          
          {user ? (
            <div className="auth-box">
              {user.role !== 'user' && (
                <span className={`user-badge role-${user.role}`}>
                  {ROLE_LABELS[user.role]}
                </span>
              )}
              <button onClick={() => { setAccountOpen(true); setIsOpen(false); }} className="btn-cart" title="Mi cuenta" aria-label="Mi cuenta">
                <UserRound size={18} />
              </button>
              <button onClick={() => { signOut(); setIsOpen(false); }} className="btn-logout">Salir</button>
            </div>
          ) : (
            <Link to="/login" onClick={() => setIsOpen(false)} className="btn-login">
              <User size={18} /> Entrar
            </Link>
          )}
        </div>

        <div className="nav-icons">
          <ThemeToggle />
          <Link to="/market?carrito=1" onClick={() => setIsOpen(false)} className="nav-cart" title="Carrito" aria-label="Carrito">
            <ShoppingCart size={22} />
            {cartCount > 0 && <span className="nav-cart-badge">{cartCount}</span>}
          </Link>
        </div>

        <button className="mobile-toggle" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
    </nav>
    {accountOpen && <AccountModal onClose={() => setAccountOpen(false)} />}
    </>
  );
}
