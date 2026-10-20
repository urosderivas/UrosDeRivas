import { useEffect, useState } from 'react';
import { useStore } from './store';
import { useLocation } from 'react-router-dom';
import { AdminGuard } from './AdminGuard';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { StripeAdapter } from '../infrastructure/StripeAdapter';
import { MarketItemModal } from './MarketItemModal';
import { MyOrdersModal } from './MyOrdersModal';
import { MessageModal } from './components/MessageModal';
import { ConfirmModal } from './components/ConfirmModal';
import { MarketItem } from '../domain/entities';
import { ShoppingCart } from 'lucide-react';
import { CartSidebar } from './components/CartSidebar';
import { ProductModal } from './ProductModal';
import { takeCartCheckout } from './store';
import { ProductCard } from './components/ProductCard';
import './Market.css';

const adapter = new SupabaseAdapter();
const stripeAdapter = new StripeAdapter();

export function Market() {
  const { user, items, loading, fetchItems, cart, addToCart, clearCart } = useStore();
  const location = useLocation();

  const [modalOpen, setModalOpen] = useState(false);
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [editItem, setEditItem] = useState<MarketItem | null>(null);

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [messageAlert, setMessageAlert] = useState<{ open: boolean, title: string, message: string }>({ open: false, title: '', message: '' });
  const [confirmPrompt, setConfirmPrompt] = useState<{ open: boolean, action: (() => void) | null, message: string }>({ open: false, action: null, message: '' });

  // Producto abierto en la ventana de compra
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);

  // Enlace directo a un producto desde la portada: /market?producto=<id>
  const productParam = new URLSearchParams(location.search).get('producto');
  useEffect(() => {
    if (!productParam) return;
    const item = items.find(i => i.id === productParam);
    if (item) setSelectedItem(item);
  }, [productParam, items]);

  const showMessage = (title: string, message: string) => {
    setMessageAlert({ open: true, title, message });
  };

  useEffect(() => {
    fetchItems();
    const params = new URLSearchParams(location.search);
    if (params.get('success')) {
      if (takeCartCheckout()) clearCart();
      showMessage('Pago Completado', '¡Pago completado con éxito! El club se pondrá en contacto contigo para la entrega. Puedes seguir el estado en "Mis pedidos".');
    }
    if (params.get('carrito')) setCartOpen(true);
    if (params.get('canceled')) {
      takeCartCheckout();
      stripeAdapter.cancelPendingCheckout().finally(() =>
        showMessage('Pago Cancelado', 'El pago ha sido cancelado. Puedes volver a intentarlo cuando quieras.')
      );
    }
  }, [fetchItems, clearCart, location.search]);

  const handleSaveItem = async (itemData: Omit<MarketItem, 'id'>) => {
    if (editItem) {
      await adapter.updateItem(editItem.id, itemData);
    } else {
      await adapter.createItem(itemData);
    }
    fetchItems();
  };

  const handleOpenCreate = () => { setEditItem(null); setModalOpen(true); };
  const handleOpenEdit = (item: MarketItem) => { setEditItem(item); setModalOpen(true); };

  const handleDelete = async (id: string) => {
    setConfirmPrompt({
      open: true,
      message: '¿Seguro que quieres borrar este producto de forma permanente?',
      action: async () => {
        try { await adapter.deleteItem(id); fetchItems(); }
        catch (e: any) { showMessage('Error', e.message); }
      }
    });
  };

  const handleAddToCart = (item: MarketItem, config: Record<string, string>) => {
    // Un id por combinación de opciones, para sumar cantidad si se repite
    const configSig = Object.entries(config).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join('|');
    addToCart({
      cartItemId: `${item.id}-${configSig}`,
      product: item,
      quantity: 1,
      selectedVariables: config
    });
    setSelectedItem(null);
    setCartOpen(true);
  };

  const handleBuyNow = async (item: MarketItem, config: Record<string, string>) => {
    if (!user) return;
    setCheckoutLoading(item.id);
    try {
      const url = await stripeAdapter.createCheckoutSessionFromCart([{
        cartItemId: `${item.id}-quick`,
        product: item,
        quantity: 1,
        selectedVariables: config
      }], user.email);
      window.location.href = url;
    } catch (e: any) {
      setSelectedItem(null);
      showMessage('Error procesando pago', e.message);
      setCheckoutLoading(null);
    }
  };

  const SkeletonGrid = () => (
    <>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="skeleton-card-market">
          <div className="skeleton-image skeleton-shimmer" />
          <div className="skeleton-info">
            <div className="skeleton-text skeleton-shimmer" />
            <div className="skeleton-text-short skeleton-shimmer" />
          </div>
          <div className="skeleton-footer">
            <div className="skeleton-btn skeleton-shimmer" />
            <div className="skeleton-btn skeleton-shimmer" />
          </div>
        </div>
      ))}
    </>
  );

  return (
    <>
      <div className="market-container">
        <div className="market-header">
          <div>
            <p className="market-kicker">Uros de Rivas</p>
            <h1>Tienda oficial</h1>
            {!loading && items.length > 0 && <p className="market-count">{items.length} {items.length === 1 ? 'producto' : 'productos'}</p>}
          </div>
          <div className="market-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button className="btn-cart-toggle" onClick={() => setCartOpen(true)}>
              <ShoppingCart size={20} />
              {cart.length > 0 && <span className="cart-badge">{cart.length}</span>}
              <span className="cart-label">Carrito</span>
            </button>
            {user && <button className="btn-secondary hidden-mobile" onClick={() => setOrdersModalOpen(true)}>📌 Mis Pedidos</button>}
            <AdminGuard>
              <button className="btn-admin-add hidden-mobile" onClick={handleOpenCreate}>+ Añadir Producto</button>
            </AdminGuard>
          </div>
        </div>

        <div className="products-grid">
          {loading ? (
            <SkeletonGrid />
          ) : items.length === 0 ? (
            <p className="no-items">Próximamente disponible.</p>
          ) : (
            items.map(item => (
              <ProductCard key={item.id} item={item} onOpen={() => setSelectedItem(item)} adminActions={
                <AdminGuard>
                  <div className="admin-card-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn-admin-edit" onClick={() => handleOpenEdit(item)} title="Editar">✏️</button>
                    <button className="btn-admin-delete" onClick={() => handleDelete(item.id)} title="Borrar">X</button>
                  </div>
                </AdminGuard>
              } />
            ))
          )}
        </div>
      </div>

      <ProductModal
        item={selectedItem}
        isLoggedIn={!!user}
        buying={checkoutLoading !== null}
        onClose={() => setSelectedItem(null)}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
      />
      <CartSidebar isOpen={cartOpen} onClose={() => setCartOpen(false)} showMessage={showMessage} />
      <MarketItemModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSaveItem} initial={editItem} />
      {ordersModalOpen && <MyOrdersModal onClose={() => setOrdersModalOpen(false)} />}
      <MessageModal
        isOpen={messageAlert.open}
        onClose={() => setMessageAlert(prev => ({ ...prev, open: false }))}
        title={messageAlert.title}
        message={messageAlert.message}
      />
      <ConfirmModal
        isOpen={confirmPrompt.open}
        title="Confirmar Acción"
        message={confirmPrompt.message}
        onConfirm={() => { if (confirmPrompt.action) confirmPrompt.action(); setConfirmPrompt(prev => ({ ...prev, open: false, action: null })); }}
        onCancel={() => setConfirmPrompt(prev => ({ ...prev, open: false, action: null }))}
      />
    </>
  );
}
