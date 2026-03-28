import { useEffect, useState } from 'react';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { Order } from '../domain/entities';
import { Modal } from './components/Modal';
import { ShoppingBag, FileText } from 'lucide-react';
import { InvoiceGenerator } from '../application/services/InvoiceGenerator';
import './Market.css';

const adapter = new SupabaseAdapter();
const invoiceGen = new InvoiceGenerator();

export function MyOrdersModal({ onClose }: { onClose: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

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

  // Group orders by stripe_session_id
  const grouped = orders.reduce((acc, order) => {
    const key = order.stripe_session_id || order.id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(order);
    return acc;
  }, {} as Record<string, Order[]>);

  const handleGenerateInvoice = async (groupOrders: Order[], groupId: string) => {
    setGeneratingPdf(groupId);
    try {
      const isStripe = groupId.startsWith('cs_');
      const allCompleted = groupOrders.every(o => o.status === 'completed');
      let paymentStatus: 'paid_stripe' | 'paid_hand' | 'pending' = 'pending';
      if (isStripe && allCompleted) paymentStatus = 'paid_stripe';
      else if (!isStripe && allCompleted) paymentStatus = 'paid_hand';

      await invoiceGen.generatePdfFactura(groupOrders, paymentStatus, isStripe ? groupId : undefined);
    } catch (e) {
      console.error("Error generating invoice", e);
    }
    setGeneratingPdf(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'cancelled': return '#ef4444';
      case 'processing': return '#f59e0b';
      default: return '#f59e0b';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'COMPLETADO';
      case 'cancelled': return 'CANCELADO';
      case 'processing': return 'PROCESANDO';
      default: return 'PENDIENTE';
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Mis Pedidos"
      icon={<ShoppingBag size={22} />}
      maxWidth="650px"
    >
      <p className="text-secondary" style={{ marginTop: '-10px', marginBottom: '1.5rem' }}>
        Sigue el estado de tus compras de la Tienda Oficial.
      </p>
      
      {loading ? (
        <p>Cargando pedidos...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p>Aún no has realizado ninguna compra.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '55vh', overflowY: 'auto', paddingRight: '8px' }}>
          {Object.entries(grouped).map(([groupId, groupOrders]) => {
            const first = groupOrders[0];
            const groupTotal = groupOrders.reduce((sum, o) => sum + o.amount, 0);
            const worstStatus = groupOrders.some(o => o.status === 'cancelled') ? 'cancelled'
              : groupOrders.some(o => o.status === 'pending') ? 'pending'
              : groupOrders.some(o => o.status === 'processing') ? 'processing'
              : 'completed';

            return (
              <li key={groupId} style={{ 
                background: 'var(--secondary-bg)', 
                padding: '1rem', 
                borderRadius: '10px',
                borderLeft: `4px solid ${getStatusColor(worstStatus)}` 
              }}>
                {/* Header: status + date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {new Date(first.created_at).toLocaleDateString()} · {first.buyer_name}
                  </span>
                  <span style={{ 
                    fontSize: '0.7rem', fontWeight: 700, padding: '2px 10px', borderRadius: '12px',
                    background: `${getStatusColor(worstStatus)}22`, color: getStatusColor(worstStatus),
                    textTransform: 'uppercase', letterSpacing: '0.04em'
                  }}>
                    {getStatusLabel(worstStatus)}
                  </span>
                </div>

                {/* Items list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
                  {groupOrders.map(o => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.92rem' }}>
                      <span>
                        <strong>{o.item_name}</strong>
                        {(o.quantity || 1) > 1 && <span style={{ color: '#d4af37', fontWeight: 700 }}> x{o.quantity}</span>}
                        {o.size && <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>({o.size})</span>}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', marginLeft: '12px' }}>
                        €{o.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Footer: total + invoice button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                  <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--primary-color)' }}>
                    Total: €{groupTotal.toFixed(2)}
                  </span>
                  <button 
                    onClick={() => handleGenerateInvoice(groupOrders, groupId)}
                    disabled={generatingPdf === groupId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                      color: '#ccc', padding: '5px 12px', borderRadius: '6px',
                      fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600
                    }}
                  >
                    <FileText size={14} />
                    {generatingPdf === groupId ? 'Generando...' : 'Factura'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
