import { useEffect, useState } from 'react';
import { useStore } from './store';
import { useNavigate, useLocation } from 'react-router-dom';
import { AdminGuard } from './AdminGuard';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { StripeAdapter } from '../infrastructure/StripeAdapter';
import { MarketItemModal } from './MarketItemModal';
import { MyOrdersModal } from './MyOrdersModal';
import { MessageModal } from './components/MessageModal';
import { MarketItem } from '../domain/entities';
import './Market.css';

const adapter = new SupabaseAdapter();
const stripeAdapter = new StripeAdapter();

export function Market() {
  const { user, items, loading, fetchItems } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<MarketItem | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [messageAlert, setMessageAlert] = useState<{ open: boolean, title: string, message: string }>({ open: false, title: '', message: '' });

  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});

  const showMessage = (title: string, message: string) => {
    setMessageAlert({ open: true, title, message });
  };

  useEffect(() => {
    fetchItems();
    const params = new URLSearchParams(location.search);
    if (params.get('success')) {
      showMessage('Pago Completado', '¡Pago completado con éxito! Recibirás un correo de confirmación pronto.');
      // Auto-mark order as completed using session_id from Stripe return URL
      const sessionId = params.get('session_id');
      if (sessionId) {
        adapter.getOrders().then(orders => {
          const match = orders.find((o: any) => o.stripe_session_id === sessionId);
          if (match && match.status === 'pending') {
            adapter.updateOrderStatus(match.id, 'completed').catch(console.error);
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
    if (!window.confirm('¿Seguro que quieres borrar este producto?')) return;
    try { await adapter.deleteItem(id); fetchItems(); }
    catch (e: any) { showMessage('Error', e.message); }
  };

  const handleBuy = async (item: MarketItem) => {
    if (!user) {
      alert('⚠️ Debes iniciar sesión para comprar merchandise del club.');
      navigate('/login');
      return;
    }
    
    let sizeToPass: string | undefined = undefined;
    if (item.sizes && item.sizes.length > 0) {
      sizeToPass = selectedSizes[item.id];
      if (!sizeToPass) {
        showMessage('Atención', 'Por favor, selecciona una talla antes de comprar.');
        return;
      }
    }

    setCheckoutLoading(item.id);
    try {
      const url = await stripeAdapter.createCheckoutSession(item.id, user.email, sizeToPass);
      window.location.href = url;
    } catch (e: any) {
      showMessage('Error procesando pago', e.message);
      setCheckoutLoading(null);
    }
  };

  if (loading && items.length === 0) return <div className="loading-state">Cargando productos...</div>;

  return (
    <>
      <div className="market-container">
        <div className="market-header">
          <h1>Tienda Oficial</h1>
          <div className="market-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {user && <button className="btn-secondary" onClick={() => setOrdersModalOpen(true)}>📌 Mis Pedidos</button>}
            <AdminGuard>
              <button className="btn-admin-add" onClick={handleOpenCreate}>+ Añadir Producto</button>
            </AdminGuard>
          </div>
        </div>

        <div className="products-grid">
          {items.length === 0 ? (
            <p className="no-items">Próximamente disponible.</p>
          ) : (
            items.map(item => (
              <div key={item.id} className="product-card">
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
                  {item.sizes && item.sizes.length > 0 && (
                    <div className="product-size-selection" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
                      <select 
                        value={selectedSizes[item.id] || ''} 
                        onChange={(e) => setSelectedSizes(prev => ({...prev, [item.id]: e.target.value}))}
                        style={{ padding: '0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', width: '100%', outline: 'none' }}
                      >
                        <option value="" disabled>Seleccionar Talla...</option>
                        {item.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="product-footer">
                    <span className="product-price">{item.price.toFixed(2)} €</span>
                    <button className="btn-buy" onClick={() => handleBuy(item)} disabled={checkoutLoading === item.id}>
                      {checkoutLoading === item.id ? 'Redirigiendo...' : 'Comprar'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <MarketItemModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSaveItem} initial={editItem} />
      {ordersModalOpen && <MyOrdersModal onClose={() => setOrdersModalOpen(false)} />}
      <MessageModal 
        isOpen={messageAlert.open} 
        onClose={() => setMessageAlert(prev => ({ ...prev, open: false }))} 
        title={messageAlert.title} 
        message={messageAlert.message} 
      />
    </>
  );
}
