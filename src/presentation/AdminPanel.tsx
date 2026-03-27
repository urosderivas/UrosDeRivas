import { useEffect, useState, Fragment } from 'react';
import { SupabaseAdapter } from '../infrastructure/SupabaseAdapter';
import { Order, MarketItem, User as DomainUser, SystemLog, Event } from '../domain/entities';
import { AdminGuard } from './AdminGuard';
import { useStore } from './store';
import { MarketItemModal } from './MarketItemModal';
import { MessageModal } from './components/MessageModal';
import { Trash2, RefreshCw, Pencil, CheckCircle, Clock, XCircle } from 'lucide-react';
import './AdminPanel.css';

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

  const showMessage = (title: string, message: string) => {
    setMessageAlert({ open: true, title, message });
  };
  const [loadingAttendees, setLoadingAttendees] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stripeStatuses, setStripeStatuses] = useState<Record<string, string>>({});
  const [syncingStripe, setSyncingStripe] = useState(false);
  
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
      } else if (activeTab === 'orders' && user?.role === 'admin') {
        const data = await adapter.getOrders();
        setOrders(data);
        // Auto-sync Stripe statuses on load
        setTimeout(() => handleSyncAllStripe(data), 100);
      } else if (activeTab === 'market' && user?.role === 'admin') {
        const data = await adapter.getItems();
        setItems(data);
        await syncClupikProducts(data);
      } else if (activeTab === 'events' && (user?.role === 'admin' || user?.role === 'coach')) {
        const data = await adapter.getEvents();
        setEvents(data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const syncClupikProducts = async (dbItems: MarketItem[]) => {
    try {
      const res = await fetch('https://api.clupik.com/clubs/67/shop/products/public/home?limit=100');
      if (!res.ok) return;
      const data = await res.json();
      const clupikItems = data.value || [];
      
      let syncedCount = 0;
      for (const cItem of clupikItems) {
        // Prevent dupes by checking name or ID watermark
        const exists = dbItems.some(dbItem => dbItem.name === cItem.title || dbItem.description?.includes(`[Clupik ID: ${cItem.id}]`));
        
        if (!exists) {
          await adapter.createItem({
            name: cItem.title,
            price: (cItem.minPrice || 0) / 100,
            imageUrl: `https://api.clupik.com/clubs/67/shop/image/${cItem.id}?format=large`,
            description: `Producto Oficial.\n[Clupik ID: ${cItem.id}]`,
            sizes: []
          });
          syncedCount++;
        }
      }
      
      if (syncedCount > 0) {
        const freshData = await adapter.getItems();
        setItems(freshData);
      }
    } catch (e) {
      console.error('Error syncing Clupik products', e);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleDeleteLog = async (id: string) => {
    if (!window.confirm('¿Eliminar este registro de forma permanente?')) return;
    try {
      await adapter.deleteLog(id);
      setLogs(logs.filter(log => log.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateOrderStatus = async (id: string, newStatus: Order['status']) => {
    try {
      await adapter.updateOrderStatus(id, newStatus);
      setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o));
    } catch (e) {
      console.error(e);
    }
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
    if (!window.confirm('¿Borrar producto de la tienda?')) return;
    try {
      await adapter.deleteItem(id);
      setItems(items.filter(i => i.id !== id));
    } catch (e: any) { showMessage('Error al borrar', e.message); }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('¿Eliminar esta cuenta de usuario para siempre? Esta acción no se puede deshacer.')) return;
    try {
      await adapter.deleteUser(id);
      setSystemUsers(systemUsers.filter(u => u.id !== id));
    } catch (e: any) { showMessage('Error al borrar usuario', e.message); }
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
                <td className="monospace">{log.user_email || log.user_id?.substring(0,8) || 'Anon'}</td>
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
    const newStatuses: Record<string, string> = {};
    for (const order of target) {
      if (order.stripe_session_id) {
        try {
          const result = await adapter.checkStripePayment(order.stripe_session_id);
          newStatuses[order.id] = result.payment_status; // 'paid' | 'unpaid'
          // Auto-update DB based on Stripe status (only if still pending)
          if (result.payment_status === 'paid' && order.status === 'pending') {
            await adapter.updateOrderStatus(order.id, 'processing');
          } else if (result.payment_status === 'unpaid' && order.status === 'pending') {
            await adapter.updateOrderStatus(order.id, 'cancelled');
          }
        } catch {
          newStatuses[order.id] = 'error';
        }
      } else {
        newStatuses[order.id] = 'no_session';
      }
    }
    setStripeStatuses(newStatuses);
    setSyncingStripe(false);
    // Refresh orders to reflect auto-updated statuses
    const freshOrders = await adapter.getOrders();
    setOrders(freshOrders);
  };

  const renderOrders = () => (
    <div className="admin-table-container">
      <div className="table-toolbar">
        <button className="btn-primary" onClick={() => handleSyncAllStripe()} disabled={syncingStripe}>
          {syncingStripe ? <><RefreshCw size={14} className="spin" /> Verificando...</> : '🔄 Sincronizar con Stripe'}
        </button>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Comprador</th>
            <th>Email</th>
            <th>Producto (ID)</th>
            <th>Importe</th>
            <th>Estado DB</th>
            <th>Pago Stripe</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="table-empty">Cargando...</td></tr> : 
           orders.length === 0 ? <tr><td colSpan={8} className="table-empty">Sin pedidos registrados.</td></tr> :
           orders.map(order => (
            <tr key={order.id}>
              <td>{new Date(order.created_at).toLocaleString('es-ES')}</td>
              <td>{order.buyer_name}</td>
              <td className="monospace">{order.buyer_email}</td>
              <td title={order.item_id}>
                <strong>{order.item_name}</strong>
                {order.size && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Talla: {order.size}</div>}
              </td>
              <td style={{ color: 'var(--primary-color)', fontWeight: 'bold' }}>€{order.amount}</td>
              <td>
                <span className={`status-badge ${order.status}`}>
                  {order.status === 'completed' ? <CheckCircle size={14} /> : order.status === 'processing' ? <RefreshCw size={14} className="spin" /> : order.status === 'cancelled' ? <XCircle size={14} /> : <Clock size={14} />}
                  {order.status}
                </span>
              </td>
              <td>
                {stripeStatuses[order.id] === 'paid' ? (
                  <span className="status-badge completed"><CheckCircle size={14} /> Pagado</span>
                ) : stripeStatuses[order.id] === 'unpaid' ? (
                  <span className="status-badge cancelled"><XCircle size={14} /> No pagado</span>
                ) : stripeStatuses[order.id] === 'error' ? (
                  <span className="status-badge cancelled">⚠️ Error</span>
                ) : (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>— Pulsa Sincronizar</span>
                )}
              </td>
              <td>
                <select 
                  className="status-dropdown" 
                  value={order.status} 
                  onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as Order['status'])}
                >
                  <option value="pending">Pendiente</option>
                  <option value="processing">Procesando</option>
                  <option value="completed">Completado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderUsers = () => (
    <div className="admin-table-container">
      <h3>Usuarios Registrados</h3>
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

  const handleLoadAttendees = async (eventId: string) => {
    setLoadingAttendees(eventId);
    try {
      const data = await adapter.getEventAttendees(eventId);
      setAttendees({ ...attendees, [eventId]: data });
    } catch (e: any) { showMessage('Error', e.message); }
    setLoadingAttendees(null);
  };

  const renderEvents = () => (
    <div className="admin-table-container">
      <h3>Inscripciones a Eventos Propios</h3>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Evento</th>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Inscritos</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={4} className="table-empty">Cargando eventos...</td></tr> :
           events.length === 0 ? <tr><td colSpan={4} className="table-empty">No hay eventos propios guardados en el sistema.</td></tr> :
           events.map(ev => (
            <Fragment key={ev.id}>
             <tr>
               <td>{ev.title}</td>
               <td>{new Date(ev.date).toLocaleDateString()}</td>
               <td><span className="status-badge processing">{ev.type.toUpperCase()}</span></td>
               <td>
                 <button className="btn-secondary" onClick={() => handleLoadAttendees(ev.id)} disabled={loadingAttendees === ev.id}>
                   {loadingAttendees === ev.id ? 'Cargando...' : 'Ver Asistentes'}
                 </button>
               </td>
             </tr>
             {attendees[ev.id] && (
               <tr className="attendees-row">
                 <td colSpan={4}>
                   <div className="attendees-list">
                     <strong style={{ display: 'block', marginBottom: '0.75rem' }}>Usuarios Inscritos ({attendees[ev.id].length}):</strong>
                     {attendees[ev.id].length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>Nadie inscrito todavía.</p> : (
                       <table className="admin-table" style={{ marginTop: '0.5rem' }}>
                         <thead><tr><th>Email</th><th>Fecha Inscripción</th><th>Acciones</th></tr></thead>
                         <tbody>
                           {attendees[ev.id].map((att: any) => (
                             <tr key={att.user_id}>
                               <td className="monospace">{att.user_email}</td>
                               <td>{new Date(att.created_at).toLocaleString('es-ES')}</td>
                               <td>
                                 <button className="btn-icon delete" title="Eliminar inscripción" onClick={async () => {
                                   if (!window.confirm(`¿Eliminar a ${att.user_email} de este evento?`)) return;
                                   try {
                                     await adapter.removeEventRegistration(ev.id, att.user_id);
                                     handleLoadAttendees(ev.id);
                                   } catch (err: any) { showMessage('Error', err.message); }
                                 }}>
                                   <XCircle size={16} />
                                 </button>
                               </td>
                             </tr>
                           ))}
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
          Eventos & Inscripciones
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
    </AdminGuard>
  );
}
