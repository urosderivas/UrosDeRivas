import { useEffect, useState, Fragment, lazy, Suspense } from 'react';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { Order, MarketItem, SystemLog, Event } from '../domain/entities';
import { isFreeEvent, startingPrice } from '../domain/pricing';
import { formatDateRanges } from '../utils/dates';
import { registrationDetail } from '../utils/registrations';
import { AdminGuard } from './AdminGuard';
import { AppointmentsAdmin } from './AppointmentsAdmin';
import { ROLES, ROLE_LABELS, Role, STAFF_ROLES } from '../domain/roles';
import { useStore } from './store';
import { MarketItemModal } from './MarketItemModal';
import { MessageModal } from './components/MessageModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Trash2, RefreshCw, Pencil, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import './AdminPanel.css';
import { InvoiceGenerator, invoicePaymentStatus } from '../application/services/InvoiceGenerator';
import * as XLSX from 'xlsx';
import { CLUPIK } from '../config';

// El escáner (html5-qrcode) solo se descarga al abrirlo
const QrScannerModal = lazy(() => import('./components/QrScannerModal').then(m => ({ default: m.QrScannerModal })));

const adapter = new SupabaseAdapter();

type Tab = 'users' | 'stats' | 'orders' | 'market' | 'events' | 'citas';

const TAB_LABELS: Record<Tab, string> = {
  users: 'Usuarios',
  stats: 'Estadísticas',
  orders: 'Pedidos',
  market: 'Catálogo Tienda',
  events: 'Eventos e inscripciones',
  citas: 'Citas',
};

/** Pestañas de cada rol: la base de datos solo deja hacer a cada uno lo de sus pestañas. */
const ROLE_TABS: Record<Role, Tab[]> = {
  admin: ['users', 'stats', 'orders', 'market', 'events', 'citas'],
  coach: ['stats', 'events'],
  tienda: ['orders', 'market'],
  fisio: ['citas'],
  user: [],
};

export function AdminPanel() {
  const { user } = useStore();
  const isAdmin = user?.role === 'admin';
  const tabs = ROLE_TABS[user?.role || 'user'];
  const [activeTab, setActiveTab] = useState<Tab>(tabs[0] || 'stats');
  const canSee = (tab: Tab) => tabs.includes(tab);

  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<MarketItem[]>([]);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [attendees, setAttendees] = useState<Record<string, any[]>>({});
  const [messageAlert, setMessageAlert] = useState<{ open: boolean, title: string, message: string }>({ open: false, title: '', message: '' });
  const [confirmPrompt, setConfirmPrompt] = useState<{ open: boolean, action: (() => void) | null, message: string }>({ open: false, action: null, message: '' });

  const showMessage = (title: string, message: string) => {
    setMessageAlert({ open: true, title, message });
  };
  const [loadingAttendees, setLoadingAttendees] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stripeStatuses, setStripeStatuses] = useState<Record<string, string>>({});
  const [syncingStripe, setSyncingStripe] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});

  // QR Scanner state
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [qrVerifying, setQrVerifying] = useState(false);

  // Market Item Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<MarketItem | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (!canSee(activeTab)) {
        // Sin permiso para esta pestaña: no se pide nada
      } else if (activeTab === 'users') {
        const data = await adapter.getSystemUsers();
        setSystemUsers(data);
      } else if (activeTab === 'stats') {
        const data = await adapter.getLogs();
        setLogs(data);
        if (user?.role === 'admin') {
          const sysUsers = await adapter.getSystemUsers();
          setSystemUsers(sysUsers);
        }
      } else if (activeTab === 'orders') {
        const data = await adapter.getOrders();
        setOrders(data);
        // Auto-sync Stripe statuses on load
        setTimeout(() => handleSyncAllStripe(data), 100);
      } else if (activeTab === 'market') {
        const data = await adapter.getItems();
        setItems(data);
      } else if (activeTab === 'events') {
        const data = await adapter.getEvents();
        setEvents(data);
        setTimeout(() => handleSyncAllCampusStripe(data), 100);
      } else if (activeTab === 'citas' && isAdmin) {
        // El admin elige a qué fisio crearle el calendario
        setSystemUsers(await adapter.getSystemUsers());
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleMigrateClupikData = async () => {
    if (!window.confirm("¿Importar todo el catálogo de Clupik a la base local?\n\nEsto añadirá variables automáticas (Jugador, Equipo) y detendrá la conexión externa en tiempo real.")) return;
    try {
      setLoading(true);
      const res = await fetch(`https://api.clupik.com/clubs/${CLUPIK.clubId}/shop/products/public/home?limit=100`);
      if (!res.ok) throw new Error("API Clupik inaccesible");
      const data = await res.json();
      const clupikItems = data.value || data.data || data || [];

      let syncedCount = 0;
      for (const cItem of clupikItems) {
        let detailData = cItem;
        try {
          const detailRes = await fetch(`https://api.clupik.com/clubs/${CLUPIK.clubId}/shop/product/${cItem.id}`);
          if (detailRes.ok) {
            const rawDetail = await detailRes.json();
            detailData = rawDetail.data || rawDetail;
          }
        } catch (e) { }

        const rawId = cItem.id.toString().replace('clupik_', '');
        const price = detailData.minPrice ? detailData.minPrice / 100 : (detailData.price ? detailData.price / 100 : 0);
        const imageUrl = `https://api.clupik.com/clubs/${CLUPIK.clubId}/shop/image/${rawId}?format=large`;
        const name = detailData.title || cItem.title;
        const desc = detailData.description || '';

        const customFields = [];
        let sizes: string[] = [];

        if (detailData.productGroupAttributes) {
          const attr = detailData.productGroupAttributes.find((a: any) => a.name === "Tallas" || a.name?.Tallas);
          if (attr && Array.isArray(attr.values)) {
            sizes = attr.values;
            customFields.push({ name: 'Talla', type: 'categorical', options: attr.values, required: true });
          }
        }

        const nameMatcher = name.toLowerCase();
        if (nameMatcher.includes('cubre') || nameMatcher.includes('chándal') || nameMatcher.includes('chaqueta')) {
          customFields.push({ name: 'Jugador/a con el que tiene relación', type: 'text', required: true });
          customFields.push({ name: 'Equipo al que pertenece', type: 'text', required: true });
        } else if (nameMatcher.includes('camiseta')) {
          customFields.push({ name: 'Número a imprimir (Opcional)', type: 'text', required: false });
          customFields.push({ name: 'Jugador/a', type: 'text', required: true });
        }

        const exists = items.some(i => i.name === name);
        if (!exists) {
          await adapter.createItem({
            name,
            price,
            imageUrl,
            description: desc,
            sizes: sizes,
            custom_fields: customFields
          } as any);
          syncedCount++;
        }
      }
      showMessage("Migración Clupik", `Se han importado ${syncedCount} artículos a la base de datos interna con campos personalizados habilitados.`);
      const freshData = await adapter.getItems();
      setItems(freshData);
    } catch (e: any) {
      console.error(e);
      showMessage("Error", "No se pudo sincronizar Clupik: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // El rol llega después del primer render: se abre la primera pestaña del rol
  useEffect(() => {
    if (tabs.length) setActiveTab(tabs[0]);
  }, [user?.role]);

  useEffect(() => {
    fetchData();
  }, [activeTab, user?.role]);

  const handleDeleteLog = async (id: string) => {
    setConfirmPrompt({
      open: true,
      message: '¿Eliminar este registro de forma permanente?',
      action: async () => {
        try {
          await adapter.deleteLog(id);
          setLogs(logs.filter(log => log.id !== id));
        } catch (e) { console.error(e); }
      }
    });
  };

  // Cambia el estado de todas las líneas de un pedido (un pedido del carrito tiene varias)
  const handleUpdateOrderStatus = async (ids: string[], newStatus: Order['status']) => {
    try {
      await Promise.all(ids.map(id => adapter.updateOrderStatus(id, newStatus)));
      setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, status: newStatus } : o));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteOrder = async (ids: string[], itemName: string, buyer: string) => {
    setConfirmPrompt({
      open: true,
      message: `¿Eliminar permanentemente el pedido de "${itemName}" realizado por ${buyer}? Esta acción no reembolsa el pago en Stripe, únicamente elimina este registro del sistema y libera el bloqueo de base de datos.`,
      action: async () => {
        try {
          await Promise.all(ids.map(id => adapter.deleteOrder(id)));
          setOrders(prev => prev.filter(o => !ids.includes(o.id)));
          showMessage('Éxito', 'Pedido eliminado correctamente.');
        } catch (e: any) {
          showMessage('Error al borrar pedido', e.message);
        }
      }
    });
  };

  const handleSaveItem = async (itemData: Omit<MarketItem, 'id'>) => {
    if (editItem) {
      await adapter.updateItem(editItem.id, itemData);
    } else {
      await adapter.createItem(itemData);
    }
    const data = await adapter.getItems();
    setItems(data);
  };

  // Ocultar un producto (sin stock, de otra temporada...) sin borrarlo
  const handleToggleItemActive = async (item: MarketItem) => {
    try {
      const updated = await adapter.updateItem(item.id, { active: item.active === false });
      setItems(prev => prev.map(i => i.id === item.id ? updated : i));
    } catch (e: any) { showMessage('Error', e.message); }
  };

  const handleDeleteItem = async (id: string) => {
    setConfirmPrompt({
      open: true,
      message: '¿Borrar producto de la tienda de forma permanente?',
      action: async () => {
        try {
          await adapter.deleteItem(id);
          setItems(items.filter(i => i.id !== id));
        } catch (e: any) { showMessage('Error al borrar', e.message); }
      }
    });
  };

  const handleDeleteUser = async (id: string) => {
    setConfirmPrompt({
      open: true,
      message: '¿Eliminar esta cuenta de usuario para siempre? Esta acción no se puede deshacer.',
      action: async () => {
        try {
          await adapter.deleteUser(id);
          setSystemUsers(systemUsers.filter(u => u.id !== id));
        } catch (e: any) { showMessage('Error al borrar usuario', e.message); }
      }
    });
  };

  const renderStats = () => (
    <>
      <div className="admin-stats-summary">
        <div className="stat-card">
          <h3>Total de Registros</h3>
          <p className="stat-number">{logs.length}</p>
        </div>
        <div className="stat-card">
          <h3>Actividad 24h</h3>
          <p className="stat-number">{logs.filter(l => new Date(l.created_at).getTime() > Date.now() - 86400000).length}</p>
        </div>
      </div>
      <div className="admin-table-container">
        <h3>Últimas Acciones Registradas (Últimas 50)</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario/ID</th>
              <th>Acción</th>
              <th>Detalles</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="table-empty">Cargando...</td></tr> :
              logs.length === 0 ? <tr><td colSpan={5} className="table-empty">Sin actividad.</td></tr> :
                logs.slice(0, 50).map(log => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString('es-ES')}</td>
                    <td className="monospace">
                      {log.user_email || systemUsers.find(u => u.id === log.user_id)?.email || log.user_id?.substring(0, 8) || 'Anon'}
                    </td>
                    <td><span className="badge-action">{log.action_type}</span></td>
                    <td><pre className="metadata-box">{log.metadata ? JSON.stringify(log.metadata) : '-'}</pre></td>
                    <td>
                      {isAdmin && <button onClick={() => handleDeleteLog(log.id)} className="btn-icon delete" title="Borrar"><Trash2 size={16} /></button>}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  );

  // ¿Pagado con tarjeta? Manda lo último que ha dicho Stripe en el panel; si no se ha
  // consultado, lo que ya dejaron el webhook o una sincronización anterior en el estado.
  const orderPaid = (o: Order) =>
    stripeStatuses[o.id] !== undefined ? stripeStatuses[o.id] === 'paid' : o.status === 'processing' || o.status === 'completed';
  const orderChecked = (o: Order) => stripeStatuses[o.id] !== undefined || orderPaid(o);
  const registrationPaid = (att: any) =>
    stripeStatuses[att.stripe_session_id] !== undefined ? stripeStatuses[att.stripe_session_id] === 'paid' : att.status === 'completed';
  const registrationChecked = (att: any) => stripeStatuses[att.stripe_session_id] !== undefined || registrationPaid(att);

  /**
   * Comprueba en Stripe los pagos de los pedidos. Al abrir la pestaña solo los pendientes
   * (los demás ya los confirmó el webhook o una sincronización anterior); el botón
   * "Sincronizar todos" los comprueba todos y lo que diga Stripe pasa a ser lo que se ve.
   */
  const handleSyncAllStripe = async (ordersList?: Order[], all = false) => {
    setSyncingStripe(true);
    const target = (ordersList || orders).filter(o => all || o.status === 'pending');

    // Sesiones de Stripe sin repetir (un carrito con varios artículos comparte sesión)
    const sessionIdsToVerify = [...new Set(
      target.map(o => o.stripe_session_id).filter((id): id is string => !!id && id.startsWith('cs_'))
    )];

    const newStatuses: Record<string, string> = { ...stripeStatuses };

    // Batch fetch from Edge Function
    if (sessionIdsToVerify.length > 0) {
      try {
        const batchResults = await adapter.checkStripePaymentsBatch(sessionIdsToVerify);
        const updates: Promise<unknown>[] = [];
        for (const order of target) {
          if (order.stripe_session_id && batchResults[order.stripe_session_id]) {
            const result = batchResults[order.stripe_session_id];
            newStatuses[order.id] = result.payment_status;

            // Auto-update DB based on Stripe status (only if still pending). An open
            // session is also "unpaid" while the buyer is still paying: cancel only expired ones.
            if (result.payment_status === 'paid' && order.status === 'pending') {
              updates.push(adapter.updateOrderStatus(order.id, 'processing'));
            } else if (result.status === 'expired' && order.status === 'pending') {
              updates.push(adapter.updateOrderStatus(order.id, 'cancelled'));
            }
          } else if (!order.stripe_session_id) {
            newStatuses[order.id] = 'no_session';
          }
        }
        await Promise.all(updates);
      } catch (err) {
        console.error("Batch verification failed:", err);
      }
    }
    setStripeStatuses(newStatuses);
    setSyncingStripe(false);
    // Refresh orders to reflect auto-updated statuses
    const freshOrders = await adapter.getOrders();
    setOrders(freshOrders);
  };

  const generateReceipt = (groupKey: string, groupOrders: Order[]) => {
    const first = groupOrders[0];
    const isPaidStripe = !!first.stripe_session_id?.startsWith('cs_') && orderPaid(first);
    const paymentStatus = isPaidStripe ? 'paid_stripe' : invoicePaymentStatus(groupKey, groupOrders);

    InvoiceGenerator.generateReceiptPdf({
      orderGroupId: groupKey,
      clientName: first.buyer_name,
      clientEmail: first.buyer_email,
      orders: groupOrders,
      date: new Date(first.created_at),
      paymentStatus
    });
  };

  const handleQrResult = async (qrData: string) => {
    setQrScannerOpen(false);
    setQrVerifying(true);

    try {
      // Parse QR format: uros_id_<stripe_session_id>
      let sessionId = qrData;
      if (qrData.startsWith('uros_id_')) {
        sessionId = qrData.replace('uros_id_', '');
      }

      // Look up in DB
      const result = await adapter.lookupByStripeSession(sessionId);

      if (!result.found) {
        showMessage('❌ No encontrado', `No se encontró ningún pedido o inscripción con el código escaneado.\n\nCódigo: ${sessionId.substring(0, 20)}...`);
        setQrVerifying(false);
        return;
      }

      // If it's a Stripe order, also verify payment with Stripe
      let stripeStatus = '';
      const isStripeOrder = sessionId.startsWith('cs_');
      if (isStripeOrder) {
        try {
          const stripeResult = await adapter.checkStripePayment(sessionId);
          stripeStatus = stripeResult.payment_status;
        } catch { stripeStatus = 'error'; }
      }

      // Build result message
      const typeLabel = result.type === 'campus' ? '🏀 Inscripción (campus, torneo o viaje)' : '🛒 Pedido Tienda';
      const statusEmoji = result.status === 'completed' ? '✅' : result.status === 'cancelled' ? '❌' : '⏳';

      let paymentLine = '';
      if (isStripeOrder) {
        paymentLine = stripeStatus === 'paid'
          ? '✅ PAGADO con Stripe'
          : stripeStatus === 'error'
            ? '⚠️ No se pudo verificar con Stripe'
            : '❌ NO PAGADO en Stripe';
      } else if (sessionId.startsWith('free_')) {
        paymentLine = '✅ Gratis (sin pago)';
      } else {
        // Pedidos e inscripciones antiguos, de antes de que todo se pagara con tarjeta
        paymentLine = '⚠️ Sin pago online (registro antiguo)';
      }

      const msg = [
        `📋 Tipo: ${typeLabel}`,
        `👤 Cliente: ${result.buyer_name}`,
        `📧 Email: ${result.buyer_email}`,
        `📦 Concepto: ${result.item_name}`,
        `💰 Importe: ${result.amount.toFixed(2)} €`,
        `📌 Estado BD: ${statusEmoji} ${result.status}`,
        '',
        `💳 ${paymentLine}`,
      ];
      // En la tienda "Completado" significa entregado: avisar para no entregarlo dos veces
      if (result.type === 'order' && result.status === 'completed') {
        msg.push('', '⚠️ YA ENTREGADO: este pedido ya se marcó como entregado. No lo entregues otra vez.');
      }

      showMessage('🔍 Resultado de Verificación', msg.join('\n'));
    } catch (err: any) {
      showMessage('Error', `No se pudo verificar: ${err.message}`);
    }
    setQrVerifying(false);
  };

  const exportOrdersExcel = () => {
    const ws = XLSX.utils.json_to_sheet(orders.map(o => {
      const qty = o.quantity || 1;
      const unitPrice = qty > 1 ? (o.amount / qty) : o.amount;
      const isStripeOrder = o.stripe_session_id && o.stripe_session_id.startsWith('cs_');
      const isPaidStripe = orderPaid(o);

      return {
        'Reserva ID / Sesión': o.stripe_session_id || o.id,
        'Fecha': new Date(o.created_at).toLocaleString('es-ES'),
        'Comprador': o.buyer_name,
        'Email': o.buyer_email,
        'Producto': o.item_name,
        'Especificaciones': o.size || '-',
        'Cantidad': qty,
        'Precio Unitario': unitPrice,
        'Importe Total': o.amount,
        'Estado': o.status,
        'Pagado': isStripeOrder ? (isPaidStripe ? '✅ Pagado Stripe' : '❌ No pagado') : o.stripe_session_id?.startsWith('free_') ? 'Gratis' : 'Sin pago online'
      };
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    XLSX.writeFile(wb, "Reporte_Tienda_Uros.xlsx");
  };

  const renderOrders = () => {
    const grouped = orders.reduce((acc, order) => {
      const key = order.stripe_session_id || order.id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(order);
      return acc;
    }, {} as Record<string, Order[]>);

    return (
      <div className="admin-table-container">
        <div className="table-toolbar">
          <button className="btn-primary" onClick={() => handleSyncAllStripe(undefined, true)} disabled={syncingStripe}>
            {syncingStripe ? <><RefreshCw size={14} className="spin" /> Verificando...</> : '🔄 Sincronizar todos con Stripe'}
          </button>
          <button className="btn-primary" onClick={() => setQrScannerOpen(true)} disabled={qrVerifying} style={{ background: '#7c3aed', borderColor: '#6d28d9', color: '#fff' }}>
            {qrVerifying ? '⏳ Verificando...' : '📷 Escanear QR'}
          </button>
          <button className="btn-primary" onClick={exportOrdersExcel} style={{ background: '#217346', borderColor: '#1e6b41', color: '#fff', marginLeft: 'auto' }}>
            📊 Exportar Excel
          </button>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Reserva (Stripe)</th>
              <th>Comprador / Fecha</th>
              <th>Desglose Pedido</th>
              <th>Total (€)</th>
              <th>Estado</th>
              <th>Pago</th>
              <th>Justificante</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="table-empty">Cargando...</td></tr> :
              orders.length === 0 ? <tr><td colSpan={7} className="table-empty">Sin pedidos registrados.</td></tr> :
                Object.entries(grouped).map(([groupId, groupOrders]) => {
                  const first = groupOrders[0];
                  const groupTotal = groupOrders.reduce((sum, o) => sum + o.amount, 0);
                  const allCompleted = groupOrders.every(o => o.status === 'completed');
                  const isStripeOrder = groupId.startsWith('cs_');
                  const isPaidStripe = orderPaid(first);
                  const stripeChecked = orderChecked(first);

                  return (
                    <tr key={groupId} style={{ borderBottom: '3px solid var(--separator)' }}>
                      <td className="monospace" style={{ fontSize: '0.8rem' }}>
                        {groupId.substring(0, 12)}...
                        {isStripeOrder && isPaidStripe && <div style={{ color: 'green', fontSize: '0.75rem', marginTop: '4px' }}>✅ Pagado Stripe</div>}
                        {isStripeOrder && stripeChecked && !isPaidStripe && <div style={{ color: '#e53935', fontSize: '0.75rem', marginTop: '4px' }}>❌ No pagado</div>}
                      </td>
                      <td>
                        <strong>{first.buyer_name}</strong><br />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{first.buyer_email}</span><br />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(first.created_at).toLocaleDateString()}</span>
                      </td>
                      <td>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem' }}>
                          {groupOrders.map(o => (
                            <li key={o.id} style={{ marginBottom: '6px' }}>
                              • <strong>{o.item_name}</strong>
                              {(o.quantity || 1) > 1 && <span style={{ color: 'var(--accent-text)', fontWeight: 700, marginLeft: '4px' }}>x{o.quantity}</span>}
                              {o.size && <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>[{o.size}]</span>}
                              <span style={{ marginLeft: '6px', color: '#0e70ab' }}>
                                {(o.quantity || 1) > 1
                                  ? `(€${(o.amount / o.quantity).toFixed(2)} c/u = €${o.amount.toFixed(2)})`
                                  : `(€${o.amount.toFixed(2)})`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>€{groupTotal.toFixed(2)}</td>
                      <td>
                        <select
                          className="status-dropdown"
                          value={allCompleted ? 'completed' : first.status}
                          onChange={(e) => {
                            handleUpdateOrderStatus(groupOrders.map(o => o.id), e.target.value as Order['status']);
                          }}
                        >
                          <option value="pending">Pendiente</option>
                          <option value="processing">Procesando</option>
                          <option value="completed">Completado</option>
                          <option value="cancelled">Cancelado</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {isStripeOrder ? (
                          <span style={{ fontSize: '0.75rem', color: isPaidStripe ? '#4caf50' : '#888' }}>
                            {isPaidStripe ? '✅ Online' : 'Online'}
                          </span>
                        ) : groupId.startsWith('free_') ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Gratis</span>
                        ) : (
                          // Pedidos antiguos sin pago online: se gestionan con el estado
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Sin pago online</span>
                        )}
                      </td>
                      <td>
                        <button className="btn-secondary" onClick={() => generateReceipt(groupId, groupOrders)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>
                          📄 PDF
                        </button>
                        {/* Borrar pedidos es solo de admins; la tienda cambia su estado */}
                        {user?.role === 'admin' && (
                          <button onClick={() => handleDeleteOrder(groupOrders.map(o => o.id), `Pedido Conjunto de ${first.buyer_name}`, first.buyer_name)} className="btn-icon delete" title="Borrar Reserva Completa" style={{ marginTop: '6px' }}>
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
          </tbody>
        </table>
      </div>
    );
  };

  const exportUsersExcel = () => {
    const ws = XLSX.utils.json_to_sheet(systemUsers.map(u => ({
      'ID': u.id,
      'Email': u.email,
      'Rol': ROLE_LABELS[u.role as Role] || u.role,
      'Fecha Registro': new Date(u.created_at).toLocaleString('es-ES')
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Usuarios");
    XLSX.writeFile(wb, "Reporte_Usuarios_Uros.xlsx");
  };

  const handleChangeRole = (sysUser: { id: string; email: string; role: string }, role: Role) => {
    const warning = role === 'admin'
      ? `\n\nUn administrador puede hacerlo TODO: usuarios, pedidos, eventos, roles…`
      : '';
    setConfirmPrompt({
      open: true,
      message: `¿Cambiar el rol de ${sysUser.email} a "${ROLE_LABELS[role]}"?${warning}`,
      action: async () => {
        try {
          await adapter.setUserRole(sysUser.id, role);
          setSystemUsers(prev => prev.map(u => u.id === sysUser.id ? { ...u, role } : u));
        } catch (e: any) { showMessage('Error', e.message); }
      },
    });
  };

  const renderUsers = () => (
    <div className="admin-table-container">
      <div className="table-toolbar" style={{ justifyContent: 'space-between' }}>
        <h3>Usuarios Registrados</h3>
        <button className="btn-primary" onClick={exportUsersExcel} style={{ background: '#217346', borderColor: '#1e6b41', color: '#fff' }}>
          📊 Exportar Excel
        </button>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Rol Asignado</th>
            <th>Fecha Registro</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={4} className="table-empty">Cargando usuarios...</td></tr> :
            systemUsers.length === 0 ? <tr><td colSpan={4} className="table-empty">Sin usuarios registrados o sin permisos suficientes.</td></tr> :
              systemUsers.map(sysUser => (
                <tr key={sysUser.id}>
                  <td>{sysUser.email}</td>
                  <td>
                    {sysUser.id === user?.id ? (
                      <span className="status-badge completed" title="Tu rol solo lo puede cambiar otro administrador">{ROLE_LABELS[sysUser.role as Role] || sysUser.role}</span>
                    ) : (
                      <select className="status-dropdown" value={sysUser.role || 'user'} onChange={e => handleChangeRole(sysUser, e.target.value as Role)}>
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    )}
                  </td>
                  <td>{new Date(sysUser.created_at).toLocaleDateString()}</td>
                  <td>
                    <button className="btn-icon delete" title="Eliminar cuenta" onClick={() => handleDeleteUser(sysUser.id)}><XCircle size={16} /></button>
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );

  const handleLoadAttendees = async (eventId: string, forceReload = false) => {
    // If forcing a reload (e.g., after deletion or status update), bypass toggle
    if (forceReload) {
      setLoadingAttendees(eventId);
      try {
        const data = await adapter.getEventAttendees(eventId);
        setAttendees({ ...attendees, [eventId]: data });
      } catch (e: any) { showMessage('Error', e.message); }
      setLoadingAttendees(null);
      return;
    }

    // Toggle UI expansion
    const isExpanded = !!expandedEvents[eventId];
    setExpandedEvents({ ...expandedEvents, [eventId]: !isExpanded });

    // Only load data if we are expanding and it's missing (or just always if we click "Ver")
    if (!isExpanded && !attendees[eventId]) {
      setLoadingAttendees(eventId);
      try {
        const data = await adapter.getEventAttendees(eventId);
        setAttendees({ ...attendees, [eventId]: data });
      } catch (e: any) { showMessage('Error', e.message); }
      setLoadingAttendees(null);
    }
  };

  const handleImportClupikEvents = async () => {
    try {
      const res = await fetch(`https://api.clupik.com/clubs/${CLUPIK.clubId}/publications?expand=user&languageId=${CLUPIK.languageId}&languageCode=es&limit=15`);
      if (!res.ok) throw new Error('No se pudo conectar con Clupik');
      const data = await res.json();
      const pubs = Array.isArray(data) ? data : [];
      let importedCount = 0;
      for (const p of pubs) {
        const title = p.card?.title || p.slug || 'Campus importado';
        const rawText = p.card?.text || '';
        const imgMatch = rawText.match(/<img[^>]+src=["']?([^"'>]+)["']/i);
        const imageUrl = imgMatch ? imgMatch[1] : undefined;
        const description = p.preview || '';
        const pubDate = p.date ? new Date(p.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        // Only import if title contains 'campus' (case insensitive)
        if (!title.toLowerCase().includes('campus')) continue;
        await adapter.createEvent({
          title, date: pubDate, dates: [], location: `Club ${CLUPIK.clubName}`,
          imageUrl, description, schedule: '', type: 'campus',
          price_per_day: 0, price_tiers: [], attendee_discounts: [],
          custom_fields: [], active: false,
        });
        importedCount++;
      }
      showMessage('Importación Clupik', `Se han importado ${importedCount} campus. Revisa y configura precios y fechas.`);
      fetchData();
    } catch (e: any) { showMessage('Error', e.message); }
  };

  // Mostrar u ocultar un campus a los usuarios sin abrir el formulario de edición
  const handleToggleEventActive = async (ev: Event) => {
    try {
      const updated = await adapter.updateEvent(ev.id, { active: !ev.active });
      setEvents(prev => prev.map(e => e.id === ev.id ? updated : e));
    } catch (e: any) { showMessage('Error', e.message); }
  };

    /** Igual que en Pedidos: al abrir, solo las inscripciones pendientes; con el botón, todas. */
    const handleSyncAllCampusStripe = async (eventsList?: any[], all = false) => {
    setSyncingStripe(true);
    // Auto-fetch attendees for all events if missing
    const updatedAttendees = { ...attendees };
    const targetEvents = eventsList || events;
    await Promise.all(targetEvents.filter(ev => !updatedAttendees[ev.id]).map(async ev => {
      try {
        updatedAttendees[ev.id] = await adapter.getEventAttendees(ev.id);
      } catch (e) { }
    }));
    setAttendees(updatedAttendees);

    const newStatuses: Record<string, string> = { ...stripeStatuses };

    // Collect all Stripe session IDs from all attendees
    const attMap: any[] = [];
    for (const evId in updatedAttendees) {
      for (const att of updatedAttendees[evId]) {
        if (att.stripe_session_id && att.stripe_session_id.startsWith('cs_') && (all || att.status === 'pending')) {
          attMap.push({ att });
        }
      }
    }
    const sessionIdsToVerify = [...new Set<string>(attMap.map(({ att }) => att.stripe_session_id))];

    // Process all in a single batch
    if (sessionIdsToVerify.length > 0) {
      try {
        const batchResults = await adapter.checkStripePaymentsBatch(sessionIdsToVerify);
        const updates: Promise<unknown>[] = [];
        for (const { att } of attMap) {
          const result = batchResults[att.stripe_session_id];
          if (result) {
            newStatuses[att.stripe_session_id] = result.payment_status;
            // Corregir el estado es cosa de admins (el webhook de Stripe ya lo hace solo)
            if (!isAdmin) continue;
            if (result.payment_status === 'paid' && att.status === 'pending') {
              updates.push(adapter.updateRegistrationStatus(att.id, 'completed'));
            } else if (result.status === 'expired' && att.status === 'pending') {
              updates.push(adapter.updateRegistrationStatus(att.id, 'cancelled'));
            }
          }
        }
        await Promise.all(updates);
      } catch (err) {
        console.error("Batch campus verification failed", err);
      }
    }

    setStripeStatuses(newStatuses);
    // Reload UI for the updated ones
    await Promise.all(targetEvents.filter(ev => updatedAttendees[ev.id]).map(async ev => {
      try {
        updatedAttendees[ev.id] = await adapter.getEventAttendees(ev.id);
      } catch (e) { }
    }));
    setAttendees({ ...updatedAttendees });
    setSyncingStripe(false);
  };

  const exportEventsExcel = async () => {
    setLoadingAttendees('export'); // show loading state

    // Resolve any missing attendees for accurate report
    const updatedAttendees = { ...attendees };
    for (const ev of events) {
      if (!updatedAttendees[ev.id]) {
        try {
          updatedAttendees[ev.id] = await adapter.getEventAttendees(ev.id);
        } catch (e) { console.error(e); }
      }
    }
    setAttendees(updatedAttendees);
    setLoadingAttendees(null);

    const wb = XLSX.utils.book_new();
    const eventsSummary = events.map(e => ({
      'Evento': e.title,
      'Tipo': e.type === 'torneo' ? 'Torneo / viaje' : 'Campus',
      'Fechas': e.dates?.length ? formatDateRanges(e.dates, { weekday: false }) : new Date(e.date).toLocaleDateString(),
      'Ubicación': e.location,
      'Desde (€)': isFreeEvent(e) ? 0 : startingPrice(e),
      'Inscritos': updatedAttendees[e.id]?.length || 0
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eventsSummary), 'Resumen');

    events.forEach(e => {
      const atts = updatedAttendees[e.id] || [];
      if (atts.length > 0) {
        const sheet = XLSX.utils.json_to_sheet(atts.map((a: any) => {
          const isStripeOrder = a.stripe_session_id && a.stripe_session_id.startsWith('cs_');
          const isPaidStripe = registrationPaid(a);

          return {
            'Reserva (Stripe)': a.stripe_session_id || 'Manual',
            'Email': a.user_email,
            'Días': (a.selected_days || []).join(', '),
            'Asistentes': a.num_attendees || 1,
            'Nombres': (a.attendee_names || []).join(', '),
            ...(a.custom_data || {}),
            'Importe': a.amount || 0,
            'Estado': a.status || 'pending',
            'Fecha Inscripción': new Date(a.created_at).toLocaleString('es-ES'),
            'Pagado': isStripeOrder ? (isPaidStripe ? '✅ Pagado Stripe' : '❌ No pagado') : a.stripe_session_id?.startsWith('free_') ? 'Gratis' : 'Sin pago online'
          };
        }));
        const cleanName = e.title.replace(/[\\/*?:[\]]/g, '').substring(0, 31) || 'Campus';
        XLSX.utils.book_append_sheet(wb, sheet, cleanName);
      }
    });
    XLSX.writeFile(wb, 'Reporte_Eventos_Uros.xlsx');
  };

  const renderEvents = () => (
    <div className="admin-table-container">
      <div className="table-toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <h3>Campus, torneos e inscripciones</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-primary" onClick={() => handleSyncAllCampusStripe(undefined, true)} disabled={syncingStripe} style={{ background: 'var(--accent-gold)', borderColor: 'var(--accent-strong)', color: '#111' }}>
            {syncingStripe ? <><RefreshCw size={14} className="spin" /> Verificando...</> : '🔄 Sincronizar todos con Stripe'}
          </button>
          <button className="btn-primary" onClick={() => setQrScannerOpen(true)} disabled={qrVerifying} style={{ background: '#7c3aed', borderColor: '#6d28d9', color: '#fff' }}>
            {qrVerifying ? '⏳ Verificando...' : '📷 Escanear QR'}
          </button>
          <button className="btn-primary" onClick={handleImportClupikEvents} style={{ background: '#0e70ab', borderColor: '#0b5a8b', color: '#fff' }}>
            📥 Importar Eventos Clupik
          </button>
          <button className="btn-primary" onClick={exportEventsExcel} disabled={loadingAttendees === 'export'} style={{ background: '#217346', borderColor: '#1e6b41', color: '#fff' }}>
            {loadingAttendees === 'export' ? 'Generando...' : '📊 Exportar Excel'}
          </button>
        </div>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Evento</th>
            <th>Fechas</th>
            <th>Desde</th>
            <th>Activo</th>
            <th>Inscripciones</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="table-empty">Cargando eventos...</td></tr> :
            events.length === 0 ? <tr><td colSpan={5} className="table-empty">No hay eventos guardados.</td></tr> :
              events.map(ev => (
                <Fragment key={ev.id}>
                  <tr 
                    className={`clickable-row ${expandedEvents[ev.id] ? 'expanded' : ''}`}
                    onClick={() => handleLoadAttendees(ev.id)}
                  >
                    <td>
                      <strong>{ev.title}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{ev.type === 'torneo' ? 'Torneo / viaje' : 'Campus'}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {ev.dates && ev.dates.length > 0
                        ? formatDateRanges(ev.dates, { weekday: false })
                        : new Date(ev.date).toLocaleDateString()}
                    </td>
                    <td>{isFreeEvent(ev) ? 'Gratis' : `${startingPrice(ev)}€`}</td>
                    <td>
                      <button type="button" className={`status-badge status-toggle ${ev.active ? 'completed' : 'cancelled'}`}
                        title={ev.active ? 'Visible para los usuarios. Pulsa para ocultarlo.' : 'Oculto. Pulsa para mostrarlo a los usuarios.'}
                        onClick={e => { e.stopPropagation(); handleToggleEventActive(ev); }}>
                        {ev.active ? 'SÍ' : 'NO'}
                      </button>
                    </td>
                    <td>
                      <div className="attendee-count-badge">
                        {expandedEvents[ev.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <span>{attendees[ev.id]?.length || 0}</span>
                      </div>
                    </td>
                  </tr>
                  {expandedEvents[ev.id] && attendees[ev.id] && (
                    <tr className="attendees-row">
                      <td colSpan={5}>
                        <div className="attendees-list">
                          <strong style={{ display: 'block', marginBottom: '0.75rem' }}>Inscripciones ({attendees[ev.id].length}):</strong>
                          {attendees[ev.id].length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>Nadie inscrito.</p> : (
                            <table className="admin-table" style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                              <thead>
                                <tr>
                                  <th>Reserva (Stripe)</th>
                                  <th>Comprador / Fecha</th>
                                  <th>Desglose Inscripción</th>
                                  <th>Total (€)</th>
                                  <th>Estado</th>
                                  <th>Pago</th>
                                  <th>Justificante</th>
                                </tr>
                              </thead>
                              <tbody>
                                {attendees[ev.id].map((att: any) => {
                                  const isLocal = !att.stripe_session_id || att.stripe_session_id?.startsWith('local_');
                                  const isFreeReg = att.stripe_session_id?.startsWith('free_');
                                  const isPaidStripe = registrationPaid(att);
                                  const stripeChecked = registrationChecked(att);

                                  // Build mock Order for the receipt
                                  const dummyOrder = {
                                    id: att.id,
                                    user_id: att.user_id,
                                    item_id: att.event_id,
                                    event_id: att.event_id,
                                    buyer_name: att.user_email ? att.user_email.split('@')[0] : 'Desconocido',
                                    buyer_email: att.user_email || '',
                                    item_name: ev.title,
                                    size: registrationDetail(att),
                                    quantity: 1,
                                    amount: Number(att.amount),
                                    status: att.status,
                                    stripe_session_id: att.stripe_session_id,
                                    created_at: att.created_at,
                                    type: 'campus' as const
                                  } as any;

                                  return (
                                    <tr key={att.id}>
                                      <td className="monospace">
                                        {isLocal ? 'Reserva antigua' : isFreeReg ? 'Gratis' : att.stripe_session_id?.substring(0, 12) + '...'}
                                        {!isLocal && isPaidStripe && <div style={{ color: 'green', fontSize: '0.75rem', marginTop: '4px' }}>✅ Pagado Stripe</div>}
                                        {!isLocal && stripeChecked && !isPaidStripe && <div style={{ color: '#e53935', fontSize: '0.75rem', marginTop: '4px' }}>❌ No pagado</div>}
                                      </td>
                                      <td>
                                        <strong>{(att.attendee_names || []).join(', ')}</strong><br />
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{att.user_email}</span><br />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(att.created_at).toLocaleDateString('es-ES')}</span>
                                      </td>
                                      <td>
                                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem' }}>
                                          <li>
                                            • <strong>{ev.title}</strong>
                                            <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>[{(att.attendee_names || []).join(', ')} | {formatDateRanges(att.selected_days || [], { weekday: false })}]</span>
                                          </li>
                                          {Object.entries(att.custom_data || {}).map(([k, v]) => (
                                            <li key={k} style={{ color: 'var(--text-muted)' }}>{k}: <strong>{String(v)}</strong></li>
                                          ))}
                                        </ul>
                                      </td>
                                      <td style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>€{Number(att.amount).toFixed(2)}</td>
                                      <td>
                                        <select
                                          className="status-dropdown"
                                          value={att.status || 'pending'}
                                          disabled={!isAdmin}
                                          title={isAdmin ? undefined : 'Solo un administrador puede cambiar el estado'}
                                          onChange={async (e) => {
                                            try {
                                              await adapter.updateRegistrationStatus(att.id, e.target.value);
                                              handleLoadAttendees(ev.id, true);
                                            } catch (err: any) { showMessage('Error', err.message); }
                                          }}
                                        >
                                          <option value="pending">Pendiente</option>
                                          <option value="completed">Completado</option>
                                          <option value="cancelled">Cancelado</option>
                                        </select>
                                      </td>
                                      <td style={{ textAlign: 'center' }}>
                                        {isFreeReg ? (
                                          <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Gratis</span>
                                        ) : !isLocal ? (
                                          <span style={{ fontSize: '0.75rem', color: isPaidStripe ? '#4caf50' : '#888' }}>
                                            {isPaidStripe ? '✅ Online' : 'Online'}
                                          </span>
                                        ) : (
                                          // Inscripciones antiguas sin pago online: se gestionan con el estado
                                          <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Sin pago online</span>
                                        )}
                                      </td>
                                      <td>
                                        <button className="btn-secondary" onClick={() => generateReceipt(att.stripe_session_id || att.user_id, [dummyOrder as any])} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>
                                          📄 PDF
                                        </button>
                                        {isAdmin && <button className="btn-icon delete" title="Eliminar inscripción" onClick={async () => {
                                          setConfirmPrompt({
                                            open: true,
                                            message: `¿Eliminar la inscripción de ${(att.attendee_names || []).join(', ') || att.user_email}?`,
                                            action: async () => {
                                              try {
                                                await adapter.removeEventRegistration(att.id);
                                                handleLoadAttendees(ev.id, true);
                                              } catch (err: any) { showMessage('Error', err.message); }
                                            }
                                          });
                                        }} style={{ marginTop: '6px' }}>
                                          <Trash2 size={16} />
                                        </button>}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
        </tbody>
      </table>
    </div>
  );



  const renderMarket = () => (
    <div className="admin-table-container">
      <div className="table-toolbar">
        <button className="btn-primary" onClick={() => { setEditItem(null); setModalOpen(true); }}>+ Nuevo Producto</button>
        <button className="btn-primary" onClick={handleMigrateClupikData} style={{ background: '#0e70ab', borderColor: '#0b5a8b', color: '#fff', marginLeft: 'auto' }}>
          📥 Importar Catálogo Clupik
        </button>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Imagen</th>
            <th>Nombre</th>
            <th>Precio</th>
            <th>Descripción</th>
            <th>Visible</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="table-empty">Cargando...</td></tr> :
            items.length === 0 ? <tr><td colSpan={6} className="table-empty">Tienda vacía.</td></tr> :
              items.map(item => (
                <tr key={item.id} style={item.active === false ? { opacity: 0.55 } : undefined}>
                  <td><img src={item.imageUrl} alt={item.name} className="market-thumb" /></td>
                  <td>{item.name}</td>
                  <td>€{item.price}</td>
                  <td className="description-cell">{item.description}</td>
                  <td>
                    <button type="button" className={`status-badge status-toggle ${item.active !== false ? 'completed' : 'cancelled'}`}
                      title={item.active !== false ? 'Visible en la tienda. Pulsa para ocultarlo.' : 'Oculto: no sale en la tienda ni se puede comprar. Pulsa para mostrarlo.'}
                      onClick={() => handleToggleItemActive(item)}>
                      {item.active !== false ? 'SÍ' : 'NO'}
                    </button>
                  </td>
                  <td>
                    <div className="admin-actions-cell">
                      <button className="btn-icon" title="Editar" onClick={() => { setEditItem(item); setModalOpen(true); }}><Pencil size={16} /></button>
                      <button className="btn-icon delete" title="Borrar" onClick={() => handleDeleteItem(item.id)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <AdminGuard roles={STAFF_ROLES} fallback={<div className="page-padding"><h2>Acceso Denegado</h2></div>}>
      <div className="admin-panel animate-fade-in">
        <div className="admin-header">
          <h2>Panel de {user?.role === 'admin' ? 'Administrador' : ROLE_LABELS[user?.role || 'user']}</h2>
          <button onClick={fetchData} className="btn-secondary">
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>

        <div className="admin-tabs">
          {tabs.map(tab => (
            <button key={tab} className={`tab-btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        <div className="admin-content-area">
          {loading && <div className="loading-state">Cargando...</div>}
          <div className="admin-tab-content">
            {canSee(activeTab) && activeTab === 'users' && renderUsers()}
            {canSee(activeTab) && activeTab === 'stats' && renderStats()}
            {canSee(activeTab) && activeTab === 'orders' && renderOrders()}
            {canSee(activeTab) && activeTab === 'market' && renderMarket()}
            {canSee(activeTab) && activeTab === 'events' && renderEvents()}
            {canSee(activeTab) && activeTab === 'citas' && <AppointmentsAdmin systemUsers={systemUsers} />}
          </div>
        </div>
      </div>

      <MarketItemModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSaveItem} initial={editItem} />
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
        onConfirm={() => {
          if (confirmPrompt.action) confirmPrompt.action();
          setConfirmPrompt(prev => ({ ...prev, open: false, action: null }));
        }}
        onCancel={() => setConfirmPrompt(prev => ({ ...prev, open: false, action: null }))}
      />
      {qrScannerOpen && (
        <Suspense fallback={null}>
          <QrScannerModal
            isOpen={qrScannerOpen}
            onClose={() => setQrScannerOpen(false)}
            onResult={handleQrResult}
          />
        </Suspense>
      )}
    </AdminGuard>
  );
}
