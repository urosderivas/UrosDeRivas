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
import { MarketItem, CustomField } from '../domain/entities';
import { ShoppingCart } from 'lucide-react';
import { CartSidebar } from './components/CartSidebar';
import './Market.css';

const adapter = new SupabaseAdapter();
const stripeAdapter = new StripeAdapter();

export function Market() {
  const { user, items, loading, fetchItems, cart, addToCart } = useStore();
  const location = useLocation();

  const [modalOpen, setModalOpen] = useState(false);
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [editItem, setEditItem] = useState<MarketItem | null>(null);

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [messageAlert, setMessageAlert] = useState<{ open: boolean, title: string, message: string }>({ open: false, title: '', message: '' });
  const [confirmPrompt, setConfirmPrompt] = useState<{ open: boolean, action: (() => void) | null, message: string }>({ open: false, action: null, message: '' });

  // item.id -> { fieldName: value }
  const [selectedVariables, setSelectedVariables] = useState<Record<string, Record<string, string>>>({});

  const showMessage = (title: string, message: string) => {
    setMessageAlert({ open: true, title, message });
  };

  useEffect(() => {
    fetchItems();
    const params = new URLSearchParams(location.search);
    if (params.get('success')) {
      showMessage('Pago Completado', '¡Pago completado con éxito! Recibirás un correo de confirmación pronto.');
      const sessionId = params.get('session_id');
      if (sessionId) {
        adapter.getOrders().then(orders => {
          const match = orders.filter((o: any) => o.stripe_session_id === sessionId);
          for (const order of match) {
            if (order.status === 'pending') adapter.updateOrderStatus(order.id, 'completed').catch(console.error);
          }
        }).catch(console.error);
      }
    }
    if (params.get('canceled')) {
      showMessage('Pago Cancelado', 'El pago ha sido cancelado. Puedes volver a intentarlo cuando quieras.');
    }
  }, [fetchItems, location.search]);

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

  const validateProductConfiguration = (item: MarketItem): Record<string, string> | null => {
    const config = selectedVariables[item.id] || {};

    // Check Custom Fields
    if (item.custom_fields && item.custom_fields.length > 0) {
      for (const field of item.custom_fields) {
        if (field.required && !config[field.name]) {
          showMessage('Faltan datos', `El campo "${field.name}" es obligatorio.`);
          return null;
        }
      }
    }

    // Check legacy sizes
    if (item.sizes && item.sizes.length > 0 && !config['Talla']) {
      showMessage('Faltan datos', 'Por favor, selecciona una talla antes de continuar.');
      return null;
    }
    return config;
  };

  const handleAddToCart = (item: MarketItem) => {
    if (!user) { showMessage('Atención', 'Debes iniciar sesión para comprar.'); return; }

    const config = validateProductConfiguration(item);
    if (!config) return;

    // Generate a unique ID for this configuration
    const configSig = Object.entries(config).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join('|');
    const cartItemId = `${item.id}-${configSig}`;

    addToCart({
      cartItemId,
      product: item,
      quantity: 1,
      selectedVariables: config
    });
    setCartOpen(true);
  };

  const handleBuyNow = async (item: MarketItem) => {
    if (!user) { showMessage('Atención', 'Debes iniciar sesión para comprar.'); return; }
    const config = validateProductConfiguration(item);
    if (!config) return;

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
      showMessage('Error procesando pago', e.message);
      setCheckoutLoading(null);
    }
  };

  const handleSetVar = (itemId: string, key: string, val: string) => {
    setSelectedVariables(prev => ({
      ...prev, [itemId]: { ...(prev[itemId] || {}), [key]: val }
    }));
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
          <h1>Tienda Oficial</h1>
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
            items.map(item => {
              const vars = selectedVariables[item.id] || {};
              return (
                <div key={item.id} className="product-card animate-fade-in">
                  <AdminGuard>
                    <div className="admin-card-actions">
                      <button className="btn-admin-edit" onClick={() => handleOpenEdit(item)} title="Editar">✏️</button>
                      <button className="btn-admin-delete" onClick={() => handleDelete(item.id)} title="Borrar">X</button>
                    </div>
                  </AdminGuard>
                  <div className="product-image-wrap">
                    <img src={item.imageUrl} alt={item.name} className="product-img" loading="lazy" />
                  </div>
                  <div className="product-info">
                    <h3 className="product-name">{item.name}</h3>
                    <p className="product-desc">{item.description}</p>

                    <div className="product-variables">
                      {/* Legacy Sizes mapped as a categorical field if no custom fields exist */}
                      {item.sizes && item.sizes.length > 0 && (!item.custom_fields || !item.custom_fields.find(c => c.name === 'Talla')) && (
                        <div className="var-group">
                          <label className="var-label">Talla *</label>
                          <div className="sizes-grid">
                            {item.sizes.map(s => (
                              <button key={s} type="button" onClick={() => handleSetVar(item.id, 'Talla', s)}
                                className={`market-size-chip ${vars['Talla'] === s ? 'active' : ''}`}>
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Custom Dynamic Fields */}
                      {item.custom_fields && item.custom_fields.map((field: CustomField) => (
                        <div key={field.name} className="var-group">
                          <label className="var-label">{field.name} {field.required && '*'}</label>
                          {field.type === 'categorical' ? (
                            <div className="sizes-grid">
                              {(field.options || []).map(opt => (
                                <button key={opt} type="button" onClick={() => handleSetVar(item.id, field.name, opt)}
                                  className={`market-size-chip ${vars[field.name] === opt ? 'active' : ''}`}>
                                  {opt}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <input type="text" className="market-text-input" placeholder="..."
                              value={vars[field.name] || ''} onChange={(e) => handleSetVar(item.id, field.name, e.target.value)} />
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="product-footer-actions">
                      <span className="product-price">{item.price.toFixed(2)} €</span>
                      <div className="btn-stack" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <button className="btn-add-cart" onClick={() => handleAddToCart(item)}>Añadir al Carrito</button>
                        <button className="btn-buy" onClick={() => handleBuyNow(item)} disabled={checkoutLoading === item.id}>
                          {checkoutLoading === item.id ? 'Redirigiendo...' : 'Comprar Ahora'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

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
