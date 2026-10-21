import { Link } from 'react-router-dom';
import { useStore } from './store';
import { Menu, X, User, ShoppingBag, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { MyOrdersModal } from './MyOrdersModal';
import './Navbar.css';
import { clubLogoUrl } from '../utils/media';

export function Navbar() {
  const { user, signOut, cart } = useStore();
  const cartCount = cart.reduce((n, c) => n + c.quantity, 0);
  const [isOpen, setIsOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);

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
          <Link to="/sponsors" onClick={() => setIsOpen(false)}>PATROCINADORES</Link>
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
              <button onClick={() => setOrdersOpen(true)} className="btn-cart" title="Mis Pedidos">
                <ShoppingBag size={18} />
              </button>
              <button onClick={() => { signOut(); setIsOpen(false); }} className="btn-logout">Salir</button>
            </div>
          ) : (
            <Link to="/login" onClick={() => setIsOpen(false)} className="btn-login">
              <User size={18} /> Entrar
            </Link>
          )}
        </div>

        <Link to="/market?carrito=1" onClick={() => setIsOpen(false)} className="nav-cart" title="Carrito" aria-label="Carrito">
          <ShoppingCart size={22} />
          {cartCount > 0 && <span className="nav-cart-badge">{cartCount}</span>}
        </Link>

        <button className="mobile-toggle" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>
    </nav>
    {ordersOpen && <MyOrdersModal onClose={() => setOrdersOpen(false)} />}
    </>
  );
}
