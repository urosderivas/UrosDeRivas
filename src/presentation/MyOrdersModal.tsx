import { useEffect, useState } from 'react';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { Order } from '../domain/entities';
import { Modal } from './components/Modal';
import { ShoppingBag } from 'lucide-react';
import './Market.css'; // Reusing market css classes

const adapter = new SupabaseAdapter();

export function MyOrdersModal({ onClose }: { onClose: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const data = await adapter.getOrders();
        setOrders(data || []);
      } catch (e) {
        console.error("No se pudieron cargar los pedidos", e);
      }
      setLoading(false);
    };
    fetchOrders();
  }, []);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Mis Pedidos"
      icon={<ShoppingBag size={22} />}
      maxWidth="600px"
    >
      <p className="text-secondary" style={{ marginTop: '-10px', marginBottom: '1.5rem' }}>
        Sigue el estado de tus compras de la Tienda Oficial.
      </p>
      
      {loading ? (
        <p>Cargando pedidos...</p>
      ) : orders.length === 0 ? (
        <p>Aún no has realizado ninguna compra.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '50vh', overflowY: 'auto', paddingRight: '8px' }}>
          {orders.map(o => (
            <li key={o.id} style={{ 
              background: 'var(--secondary-bg)', 
              padding: '1rem', 
              borderRadius: '8px',
              borderLeft: o.status === 'completed' ? '4px solid #10b981' : '4px solid #f59e0b' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span style={{ fontWeight: 'bold' }}>
                  {o.item_name} {(o.quantity || 1) > 1 && <span style={{ color: '#d4af37' }}>x{o.quantity}</span>} {o.size ? `(${o.size})` : ''}
                </span>
                <span className={`status-badge ${o.status}`}>{o.status.toUpperCase()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                <span>Realizado por: {o.buyer_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <span>{new Date(o.created_at).toLocaleDateString()}</span>
                <span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>€{o.amount.toFixed(2)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
