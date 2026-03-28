import { useStore } from '../store';
import { X, Trash2, Plus, Minus, ShoppingCart } from 'lucide-react';
import './CartSidebar.css';
import { StripeAdapter } from '../../infrastructure/StripeAdapter';
import { SupabaseAdapter } from '../../infrastructure/SupabaseAdapter';
import { useState } from 'react';

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  showMessage?: (title: string, message: string) => void;
}

const stripeAdapter = new StripeAdapter();
const supabaseAdapter = new SupabaseAdapter();

export function CartSidebar({ isOpen, onClose, showMessage }: CartSidebarProps) {
  const { cart, removeFromCart, updateCartQuantity, clearCart, user } = useStore();
  const [loading, setLoading] = useState(false);

  const total = cart.reduce((acc, current) => acc + current.product.price * current.quantity, 0);

  const notify = (title: string, message: string) => {
    if (showMessage) showMessage(title, message);
    else alert(message);
  };

  const handleCheckout = async () => {
    if(!user) return notify("Atención", "Inicia sesión para pagar.");
    setLoading(true);
    try {
      const url = await stripeAdapter.createCheckoutSessionFromCart(cart, user.email);
      window.location.href = url;
    } catch(e: any) {
      notify("Error procesando pago", e.message);
      setLoading(false);
    }
  };

  const handleClickCollect = async () => {
    if(!user) return notify("Atención", "Inicia sesión para reservar.");
    setLoading(true);
    try {
      const items = cart.map(c => ({
        itemId: c.product.id,
        quantity: c.quantity,
        options: c.selectedVariables || {}
      }));
      await supabaseAdapter.createOrderLocal(items, user.email);
      clearCart();
      onClose();
      notify("Pedido Reservado", "✅ Pedido reservado correctamente. Pasa por la tienda para recogerlo y pagarlo.");
    } catch(e: any) {
      notify("Error", "Error creando reserva: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div className={`cart-overlay ${isOpen ? 'open' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`cart-panel ${isOpen ? 'open' : ''}`}>
        <div className="cart-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingCart size={24} />
            <h2>Tu Carrito</h2>
          </div>
          <button className="btn-icon" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="cart-content">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <ShoppingCart size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
              <p>Tu cesta está vacía</p>
            </div>
          ) : (
            <div className="cart-items">
              {cart.map((item) => (
                <div key={item.cartItemId} className="cart-item">
                  <img src={item.product.imageUrl || ''} alt={item.product.name} />
                  <div className="cart-item-info">
                    <h4>{item.product.name}</h4>
                    <span className="cart-item-price">€{item.product.price.toFixed(2)}</span>
                    <div className="cart-item-vars">
                      {Object.entries(item.selectedVariables).map(([k, v]) => (
                        <div key={k} className="var-chip">{k}: <strong>{v}</strong></div>
                      ))}
                    </div>
                    <div className="cart-item-actions">
                      <div className="qty-controls">
                        <button onClick={() => updateCartQuantity(item.cartItemId, Math.max(1, item.quantity - 1))}><Minus size={14}/></button>
                        <span>{item.quantity}</span>
                        <button onClick={() => updateCartQuantity(item.cartItemId, item.quantity + 1)}><Plus size={14}/></button>
                      </div>
                      <button className="btn-icon delete" onClick={() => removeFromCart(item.cartItemId)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="cart-footer">
            <div className="cart-total">
              <span>Total</span>
              <span>€{total.toFixed(2)}</span>
            </div>
            <button className="checkout-btn" onClick={handleCheckout} disabled={loading}>
              {loading ? 'Procesando...' : 'Pagar Online (Stripe)'}
            </button>
            <button className="collect-btn" onClick={handleClickCollect} disabled={loading}>
              🏪 Recoger y Pagar en Tienda
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
