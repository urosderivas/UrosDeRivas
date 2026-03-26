import { useEffect, useState } from 'react';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { Order } from '../domain/entities';
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
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
        <button className="btn-close" onClick={onClose}>X</button>
        <h2>Mis Pedidos</h2>
        <p className="text-secondary" style={{ marginBottom: '1rem' }}>Sigue el estado de tus compras de la Tienda Oficial.</p>
        
        {loading ? (
          <p>Cargando pedidos...</p>
        ) : orders.length === 0 ? (
          <p>Aún no has realizado ninguna compra.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {orders.map(o => (
              <li key={o.id} style={{ 
                background: 'var(--secondary-bg)', 
                padding: '1rem', 
                borderRadius: '8px',
                borderLeft: o.status === 'completed' ? '4px solid #10b981' : '4px solid #f59e0b' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 'bold' }}>{o.buyer_name}</span>
                  <span className={`status-badge ${o.status}`}>{o.status.toUpperCase()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  <span>{new Date(o.created_at).toLocaleDateString()}</span>
                  <span style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>€{o.amount.toFixed(2)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
