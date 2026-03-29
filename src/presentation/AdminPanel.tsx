import { useEffect, useState, Fragment } from 'react';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { Order, MarketItem, SystemLog, Event } from '../domain/entities';
import { AdminGuard } from './AdminGuard';
import { useStore } from './store';
import { MarketItemModal } from './MarketItemModal';
import { MessageModal } from './components/MessageModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Trash2, RefreshCw, Pencil, XCircle } from 'lucide-react';
import './AdminPanel.css';
import { InvoiceGenerator } from '../application/services/InvoiceGenerator';
import * as XLSX from 'xlsx';

const adapter = new SupabaseAdapter();

export function AdminPanel() {
  const { user } = useStore();
  const [activeTab, setActiveTab] = useState<'users' | 'stats' | 'orders' | 'market' | 'events'>(user?.role === 'coach' ? 'stats' : 'users');

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

  // Market Item Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<MarketItem | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users' && user?.role === 'admin') {
        const data = await adapter.getSystemUsers();
        setSystemUsers(data);
      } else if (activeTab === 'stats') {
        const data = await adapter.getLogs();
        setLogs(data);
        if (user?.role === 'admin') {
          const sysUsers = await adapter.getSystemUsers();
          setSystemUsers(sysUsers);
        }
      } else if (activeTab === 'orders' && user?.role === 'admin') {
        const data = await adapter.getOrders();
        setOrders(data);
        // Auto-sync Stripe statuses on load
        setTimeout(() => handleSyncAllStripe(data), 100);
      } else if (activeTab === 'market' && user?.role === 'admin') {
        const data = await adapter.getItems();
        setItems(data);
      } else if (activeTab === 'events' && (user?.role === 'admin' || user?.role === 'coach')) {
        const data = await adapter.getEvents();
        setEvents(data);
        setTimeout(() => handleSyncAllCampusStripe(data), 100);
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
      const res = await fetch('https://api.clupik.com/clubs/67/shop/products/public/home?limit=100');
      if (!res.ok) throw new Error("API Clupik inaccesible");
      const data = await res.json();
      const clupikItems = data.value || data.data || data || [];

      let syncedCount = 0;
      for (const cItem of clupikItems) {
        let detailData = cItem;
        try {
          const detailRes = await fetch(`https://api.clupik.com/clubs/67/shop/product/${cItem.id}`);
          if (detailRes.ok) {
            const rawDetail = await detailRes.json();
            detailData = rawDetail.data || rawDetail;
          }
        } catch (e) { }

        const rawId = cItem.id.toString().replace('clupik_', '');
        const price = detailData.minPrice ? detailData.minPrice / 100 : (detailData.price ? detailData.price / 100 : 0);
        const imageUrl = `https://api.clupik.com/clubs/67/shop/image/${rawId}?format=large`;
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

  useEffect(() => {
    fetchData();
  }, [activeTab]);

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

  const handleUpdateOrderStatus = async (id: string, newStatus: Order['status']) => {
    try {
      await adapter.updateOrderStatus(id, newStatus);
      setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteOrder = async (id: string, itemName: string, buyer: string) => {
    setConfirmPrompt({
      open: true,
      message: `¿Eliminar permanentemente el pedido de "${itemName}" realizado por ${buyer}? Esta acción no reembolsa el pago en Stripe, únicamente elimina este registro del sistema y libera el bloqueo de base de datos.`,
      action: async () => {
        try {
          await adapter.deleteOrder(id);
          setOrders(orders.filter(o => o.id !== id));
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
                      <button onClick={() => handleDeleteLog(log.id)} className="btn-icon delete"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  );

  const handleSyncAllStripe = async (ordersList?: Order[]) => {
    setSyncingStripe(true);
    const target = ordersList || orders;

    // Extract all pending Stripe session IDs
    const sessionIdsToVerify: string[] = [];
    for (const order of target) {
      if (order.stripe_session_id && order.stripe_session_id.startsWith('cs_')) {
        sessionIdsToVerify.push(order.stripe_session_id);
      }
    }

    const newStatuses: Record<string, string> = { ...stripeStatuses };

    // Batch fetch from Edge Function
    if (sessionIdsToVerify.length > 0) {
      try {
        const batchResults = await adapter.checkStripePaymentsBatch(sessionIdsToVerify);
        for (const order of target) {
          if (order.stripe_session_id && batchResults[order.stripe_session_id]) {
            const result = batchResults[order.stripe_session_id];
            newStatuses[order.id] = result.payment_status;

            // Auto-update DB based on Stripe status (only if still pending)
            if (result.payment_status === 'paid' && order.status === 'pending') {
              await adapter.updateOrderStatus(order.id, 'processing');
            } else if (result.payment_status === 'unpaid' && order.status === 'pending') {
              await adapter.updateOrderStatus(order.id, 'cancelled');
            }
          } else if (!order.stripe_session_id) {
            newStatuses[order.id] = 'no_session';
          }
        }
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

  const generateFactura = (groupKey: string, groupOrders: Order[]) => {
    const first = groupOrders[0];
    const isPaidStripe = stripeStatuses[first.id] === 'paid' || stripeStatuses[first.stripe_session_id || ''] === 'paid';
    const allCompleted = groupOrders.every(o => o.status === 'completed');

    let paymentStatus: 'paid_stripe' | 'paid_hand' | 'pending' = 'pending';
    if (isPaidStripe) paymentStatus = 'paid_stripe';
    else if (allCompleted) paymentStatus = 'paid_hand';

    InvoiceGenerator.generatePdfFactura({
      orderGroupId: groupKey,
      clientName: first.buyer_name,
      clientEmail: first.buyer_email,
      orders: groupOrders,
      date: new Date(first.created_at),
      paymentStatus
    });
  };

  const exportOrdersExcel = () => {
    const ws = XLSX.utils.json_to_sheet(orders.map(o => {
      const qty = o.quantity || 1;
      const unitPrice = qty > 1 ? (o.amount / qty) : o.amount;
      const isStripeOrder = o.stripe_session_id && o.stripe_session_id.startsWith('cs_');
      const isPaidStripe = stripeStatuses[o.id] === 'paid';
      const allCompleted = o.status === 'completed';

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
        'Pago en mano': !isStripeOrder && allCompleted ? 'Sí' : 'No',
        'Pagado': isStripeOrder ? (isPaidStripe ? '✅ Pagado Stripe' : '❌ No pagado') : (allCompleted ? '✅ Completado' : 'Pendiente')
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
          <button className="btn-primary" onClick={() => handleSyncAllStripe()} disabled={syncingStripe}>
            {syncingStripe ? <><RefreshCw size={14} className="spin" /> Verificando...</> : '🔄 Sincronizar todos con Stripe'}
          </button>
          <button className="btn-primary" onClick={exportOrdersExcel} style={{ background: '#217346', borderColor: '#1e6b41', marginLeft: 'auto' }}>
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
              <th>Pago en mano</th>
              <th>Factura</th>
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
                  const isPaidStripe = stripeStatuses[first.id] === 'paid';
                  const stripeChecked = stripeStatuses[first.id] !== undefined;

                  return (
                    <tr key={groupId} style={{ borderBottom: '3px solid #eee' }}>
                      <td className="monospace" style={{ fontSize: '0.8rem' }}>
                        {groupId.substring(0, 12)}...
                        {isStripeOrder && isPaidStripe && <div style={{ color: 'green', fontSize: '0.75rem', marginTop: '4px' }}>✅ Pagado Stripe</div>}
                        {isStripeOrder && stripeChecked && !isPaidStripe && <div style={{ color: '#e53935', fontSize: '0.75rem', marginTop: '4px' }}>❌ No pagado</div>}
                      </td>
                      <td>
                        <strong>{first.buyer_name}</strong><br />
                        <span style={{ fontSize: '0.8rem', color: '#666' }}>{first.buyer_email}</span><br />
                        <span style={{ fontSize: '0.75rem', color: '#999' }}>{new Date(first.created_at).toLocaleDateString()}</span>
                      </td>
                      <td>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem' }}>
                          {groupOrders.map(o => (
                            <li key={o.id} style={{ marginBottom: '6px' }}>
                              • <strong>{o.item_name}</strong>
                              {(o.quantity || 1) > 1 && <span style={{ color: '#d4af37', fontWeight: 700, marginLeft: '4px' }}>x{o.quantity}</span>}
                              {o.size && <span style={{ color: '#555', marginLeft: '4px' }}>[{o.size}]</span>}
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
                            groupOrders.forEach(o => handleUpdateOrderStatus(o.id, e.target.value as Order['status']));
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
                        ) : (
                          <input
                            type="checkbox"
                            checked={allCompleted}
                            title="Marcar como pagado en mano"
                            onChange={(e) => {
                              const newStatus = e.target.checked ? 'completed' : 'pending';
                              groupOrders.forEach(o => handleUpdateOrderStatus(o.id, newStatus as Order['status']));
                            }}
                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                          />
                        )}
                      </td>
                      <td>
                        <button className="btn-secondary" onClick={() => generateFactura(groupId, groupOrders)} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>
                          📄 PDF
                        </button>
                        <button onClick={() => handleDeleteOrder(first.id, `Pedido Conjunto de ${first.buyer_name}`, first.buyer_name)} className="btn-icon delete" title="Borrar Reserva Completa" style={{ marginTop: '6px' }}>
                          <Trash2 size={16} />
                        </button>
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
      'Rol': u.role,
      'Fecha Registro': new Date(u.created_at).toLocaleString('es-ES')
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Usuarios");
    XLSX.writeFile(wb, "Reporte_Usuarios_Uros.xlsx");
  };

  const renderUsers = () => (
    <div className="admin-table-container">
      <div className="table-toolbar" style={{ justifyContent: 'space-between' }}>
        <h3>Usuarios Registrados</h3>
        <button className="btn-primary" onClick={exportUsersExcel} style={{ background: '#217346', borderColor: '#1e6b41' }}>
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
                  <td><span className={`status-badge ${sysUser.role === 'admin' ? 'completed' : sysUser.role === 'coach' ? 'processing' : 'pending'}`}>{sysUser.role?.toUpperCase() || 'USER'}</span></td>
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
      const res = await fetch('https://api.clupik.com/clubs/67/publications?expand=user&languageId=709&languageCode=es&limit=15');
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
          title, date: pubDate, dates: [], location: 'Club Uros de Rivas',
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

  const handleSyncAllCampusStripe = async (eventsList?: any[]) => {
    setSyncingStripe(true);
    // Auto-fetch attendees for all events if missing
    let updatedAttendees = { ...attendees };
    const targetEvents = eventsList || events;
    for (const ev of targetEvents) {
      if (!updatedAttendees[ev.id]) {
        try {
          updatedAttendees[ev.id] = await adapter.getEventAttendees(ev.id);
        } catch (e) { }
      }
    }
    setAttendees(updatedAttendees);

    const newStatuses: Record<string, string> = { ...stripeStatuses };

    // Collect all Stripe session IDs from all attendees
    const sessionIdsToVerify: string[] = [];
    const attMap: any[] = [];

    for (const evId in updatedAttendees) {
      for (const att of updatedAttendees[evId]) {
        if (att.stripe_session_id && att.stripe_session_id.startsWith('cs_')) {
          sessionIdsToVerify.push(att.stripe_session_id);
          attMap.push({ evId, att });
        }
      }
    }

    // Process all in a single batch
    if (sessionIdsToVerify.length > 0) {
      try {
        const batchResults = await adapter.checkStripePaymentsBatch(sessionIdsToVerify);
        for (const { evId, att } of attMap) {
          const result = batchResults[att.stripe_session_id];
          if (result) {
            newStatuses[att.stripe_session_id] = result.payment_status;
            if (result.payment_status === 'paid' && att.status === 'pending') {
              await adapter.updateRegistrationStatus(evId, att.user_id, 'completed');
            } else if (result.payment_status === 'unpaid' && att.status === 'pending') {
              await adapter.updateRegistrationStatus(evId, att.user_id, 'cancelled');
            }
          }
        }
      } catch (err) {
        console.error("Batch campus verification failed", err);
      }
    }

    setStripeStatuses(newStatuses);
    // Reload UI for the updated ones
    for (const ev of targetEvents) {
      if (updatedAttendees[ev.id]) {
        updatedAttendees[ev.id] = await adapter.getEventAttendees(ev.id);
      }
    }
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
      'Campus': e.title,
      'Fechas': (e.dates || []).join(', ') || new Date(e.date).toLocaleDateString(),
      'Ubicación': e.location,
      'Precio/Día': e.price_per_day,
      'Inscritos': updatedAttendees[e.id]?.length || 0
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eventsSummary), 'Resumen');

    events.forEach(e => {
      const atts = updatedAttendees[e.id] || [];
      if (atts.length > 0) {
        const sheet = XLSX.utils.json_to_sheet(atts.map((a: any) => {
          const isStripeOrder = a.stripe_session_id && a.stripe_session_id.startsWith('cs_');
          const isPaidStripe = stripeStatuses[a.stripe_session_id] === 'paid';
          const allCompleted = a.status === 'completed';

          return {
            'Reserva (Stripe)': a.stripe_session_id || 'Manual',
            'Email': a.user_email,
            'Días': (a.selected_days || []).join(', '),
            'Asistentes': a.num_attendees || 1,
            'Nombres': (a.attendee_names || []).join(', '),
            'Importe': a.amount || 0,
            'Estado': a.status || 'pending',
            'Fecha Inscripción': new Date(a.created_at).toLocaleString('es-ES'),
            'Pago en mano': !isStripeOrder && allCompleted ? 'Sí' : 'No',
            'Pagado': isStripeOrder ? (isPaidStripe ? '✅ Pagado Stripe' : '❌ No pagado') : (allCompleted ? '✅ Completado' : 'Pendiente')
          };
        }));
        const cleanName = e.title.replace(/[\\/*?:[\]]/g, '').substring(0, 31) || 'Campus';
        XLSX.utils.book_append_sheet(wb, sheet, cleanName);
      }
    });
    XLSX.writeFile(wb, 'Reporte_Campus_Uros.xlsx');
  };

  const renderEvents = () => (
    <div className="admin-table-container">
      <div className="table-toolbar" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <h3>Campus & Inscripciones</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-primary" onClick={() => handleSyncAllCampusStripe()} disabled={syncingStripe} style={{ background: '#d4af37', borderColor: '#b5952f', color: '#111' }}>
            {syncingStripe ? <><RefreshCw size={14} className="spin" /> Verificando...</> : '🔄 Sincronizar todos con Stripe'}
          </button>
          <button className="btn-primary" onClick={handleImportClupikEvents} style={{ background: '#0e70ab', borderColor: '#0b5a8b' }}>
            📥 Importar Eventos Clupik
          </button>
          <button className="btn-primary" onClick={exportEventsExcel} disabled={loadingAttendees === 'export'} style={{ background: '#217346', borderColor: '#1e6b41' }}>
            {loadingAttendees === 'export' ? 'Generando...' : '📊 Exportar Excel'}
          </button>
        </div>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Campus</th>
            <th>Fechas</th>
            <th>€/Día</th>
            <th>Activo</th>
            <th>Inscripciones</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="table-empty">Cargando campus...</td></tr> :
            events.length === 0 ? <tr><td colSpan={5} className="table-empty">No hay campus guardados.</td></tr> :
              events.map(ev => (
                <Fragment key={ev.id}>
                  <tr>
                    <td><strong>{ev.title}</strong></td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {ev.dates && ev.dates.length > 0
                        ? ev.dates.map(d => new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })).join(', ')
                        : new Date(ev.date).toLocaleDateString()}
                    </td>
                    <td>{ev.price_per_day > 0 ? `${ev.price_per_day}€` : 'Gratis'}</td>
                    <td><span className={`status-badge ${ev.active ? 'completed' : 'cancelled'}`}>{ev.active ? 'SÍ' : 'NO'}</span></td>
                    <td>
                      <button className="btn-secondary" onClick={() => handleLoadAttendees(ev.id)} disabled={loadingAttendees === ev.id}>
                        {loadingAttendees === ev.id ? 'Cargando...' : expandedEvents[ev.id] ? 'Ocultar Inscritos' : 'Ver Inscritos'}
                      </button>
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
                                  <th>Pago en mano</th>
                                  <th>Factura</th>
                                </tr>
                              </thead>
                              <tbody>
                                {attendees[ev.id].map((att: any) => {
                                  const isLocal = !att.stripe_session_id || att.stripe_session_id?.startsWith('local_');
                                  // stripeStatuses map might hold the checked status
                                  const isPaidStripe = stripeStatuses[att.stripe_session_id] === 'paid';
                                  const stripeChecked = stripeStatuses[att.stripe_session_id] !== undefined;
                                  const allCompleted = att.status === 'completed';

                                  // Build mock Order for Factura
                                  const dummyOrder = {
                                    id: att.event_id + '_' + att.user_id,
                                    user_id: att.user_id,
                                    item_id: att.event_id,
                                    event_id: att.event_id,
                                    buyer_name: (att.attendee_names || []).join(', ') || 'Desconocido',
                                    buyer_email: att.user_email || '',
                                    item_name: ev.title,
                                    size: `${(att.attendee_names || []).join(', ')} | ${(att.selected_days || []).join(', ')}`,
                                    quantity: 1,
                                    amount: Number(att.amount),
                                    status: att.status,
                                    stripe_session_id: att.stripe_session_id,
                                    created_at: att.created_at,
                                    type: 'campus' as const
                                  } as any;

                                  return (
                                    <tr key={att.user_id}>
                                      <td className="monospace">
                                        {isLocal ? 'Reserva Manual' : att.stripe_session_id?.substring(0, 12) + '...'}
                                        {!isLocal && isPaidStripe && <div style={{ color: 'green', fontSize: '0.75rem', marginTop: '4px' }}>✅ Pagado Stripe</div>}
                                        {!isLocal && stripeChecked && !isPaidStripe && <div style={{ color: '#e53935', fontSize: '0.75rem', marginTop: '4px' }}>❌ No pagado</div>}
                                      </td>
                                      <td>
                                        <strong>{(att.attendee_names || []).join(', ')}</strong><br />
                                        <span style={{ fontSize: '0.8rem', color: '#666' }}>{att.user_email}</span><br />
                                        <span style={{ fontSize: '0.75rem', color: '#999' }}>{new Date(att.created_at).toLocaleDateString('es-ES')}</span>
                                      </td>
                                      <td>
                                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.85rem' }}>
                                          <li>
                                            • <strong>{ev.title}</strong>
                                            <span style={{ color: '#555', marginLeft: '4px' }}>[{(att.attendee_names || []).join(', ')} | {(att.selected_days || []).join(', ')}]</span>
                                          </li>
                                        </ul>
                                      </td>
                                      <td style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>€{Number(att.amount).toFixed(2)}</td>
                                      <td>
                                        <select
                                          className="status-dropdown"
                                          value={att.status || 'pending'}
                                          onChange={async (e) => {
                                            try {
                                              await adapter.updateRegistrationStatus(ev.id, att.user_id, e.target.value);
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
                                        {!isLocal ? (
                                          <span style={{ fontSize: '0.75rem', color: isPaidStripe ? '#4caf50' : '#888' }}>
                                            {isPaidStripe ? '✅ Online' : 'Online'}
                                          </span>
                                        ) : (
                                          <input
                                            type="checkbox"
                                            checked={allCompleted}
                                            title="Marcar como pagado en mano"
                                            onChange={async (e) => {
                                              const newStatus = e.target.checked ? 'completed' : 'pending';
                                              try {
                                                await adapter.updateRegistrationStatus(ev.id, att.user_id, newStatus);
                                                handleLoadAttendees(ev.id, true);
                                              } catch (err: any) { showMessage('Error', err.message); }
                                            }}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                          />
                                        )}
                                      </td>
                                      <td>
                                        <button className="btn-secondary" onClick={() => generateFactura(att.stripe_session_id || `local_${att.user_id}`, [dummyOrder as any])} style={{ padding: '4px 8px', fontSize: '0.8rem' }}>
                                          📄 PDF
                                        </button>
                                        <button className="btn-icon delete" title="Cancelar Inscripción" onClick={async () => {
                                          setConfirmPrompt({
                                            open: true,
                                            message: `¿Eliminar inscripción de ${att.user_email}?`,
                                            action: async () => {
                                              try {
                                                await adapter.removeEventRegistration(ev.id, att.user_id);
                                                handleLoadAttendees(ev.id, true);
                                              } catch (err: any) { showMessage('Error', err.message); }
                                            }
                                          });
                                        }} style={{ marginTop: '6px' }}>
                                          <Trash2 size={16} />
                                        </button>
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
        <button className="btn-primary" onClick={handleMigrateClupikData} style={{ background: '#0e70ab', borderColor: '#0b5a8b', marginLeft: 'auto' }}>
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
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="table-empty">Cargando...</td></tr> :
            items.length === 0 ? <tr><td colSpan={5} className="table-empty">Tienda vacía.</td></tr> :
              items.map(item => (
                <tr key={item.id}>
                  <td><img src={item.imageUrl} alt={item.name} className="market-thumb" /></td>
                  <td>{item.name}</td>
                  <td>€{item.price}</td>
                  <td className="description-cell">{item.description}</td>
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
    <AdminGuard roles={['admin', 'coach']} fallback={<div className="page-padding"><h2>Acceso Denegado</h2></div>}>
      <div className="admin-panel animate-fade-in">
        <div className="admin-header">
          <h2>Panel de {user?.role === 'admin' ? 'Administrador' : 'Entrenador'}</h2>
          <button onClick={fetchData} className="btn-secondary">
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>

        <div className="admin-tabs">
          {user?.role === 'admin' && (
            <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
              Usuarios
            </button>
          )}
          <button className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>
            Estadísticas
          </button>
          {user?.role === 'admin' && (
            <button className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
              Pedidos
            </button>
          )}
          {user?.role === 'admin' && (
            <button className={`tab-btn ${activeTab === 'market' ? 'active' : ''}`} onClick={() => setActiveTab('market')}>
              Catálogo Tienda
            </button>
          )}
          <button className={`tab-btn ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')}>
            Campus & Inscripciones
          </button>
        </div>

        <div className="admin-content-area">
          {loading && <div className="loading-state">Cargando...</div>}
          <div className="admin-tab-content">
            {activeTab === 'users' && renderUsers()}
            {activeTab === 'stats' && renderStats()}
            {activeTab === 'orders' && renderOrders()}
            {activeTab === 'market' && renderMarket()}
            {activeTab === 'events' && renderEvents()}
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
    </AdminGuard>
  );
}
