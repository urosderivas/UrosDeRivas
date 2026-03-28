import { useState, useEffect } from 'react';
import { X, ShoppingBag } from 'lucide-react';
import { MarketItem, CustomField } from '../domain/entities';
import './MarketItemModal.css';



interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<MarketItem, 'id'>) => Promise<void>;
  initial?: MarketItem | null;
}

export function MarketItemModal({ isOpen, onClose, onSave, initial }: Props) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [stripePriceId, setStripePriceId] = useState('');

  
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Field Builder Form
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text'|'categorical'>('text');
  const [newFieldReq, setNewFieldReq] = useState(true);
  const [newFieldOptionText, setNewFieldOptionText] = useState('');
  const [newFieldOptions, setNewFieldOptions] = useState<string[]>([]);

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setPrice(String(initial.price));
      setImageUrl(initial.imageUrl);
      setDescription(initial.description || '');
      setStripePriceId(initial.stripe_price_id || '');

      setCustomFields(initial.custom_fields || []);
    } else {
      setName(''); setPrice(''); setImageUrl(''); setDescription('');
      setStripePriceId(''); setCustomFields([]);
    }
    setError('');
  }, [initial, isOpen]);



  const addCustomFieldOption = () => {
    const trimmed = newFieldOptionText.trim();
    if (trimmed && !newFieldOptions.includes(trimmed)) {
      setNewFieldOptions(prev => [...prev, trimmed]);
    }
    setNewFieldOptionText('');
  };

  const commitNewField = () => {
    if (!newFieldName.trim()) return;
    if (newFieldType === 'categorical' && newFieldOptions.length === 0) return;

    setCustomFields(prev => [...prev, {
      name: newFieldName.trim(),
      type: newFieldType,
      options: newFieldType === 'categorical' ? newFieldOptions : undefined,
      required: newFieldReq
    }]);

    setNewFieldName('');
    setNewFieldOptions([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !imageUrl) { setError('Nombre, Precio e Imagen son obligatorios.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        name,
        price: parseFloat(price),
        imageUrl,
        description,
        sizes: [],
        custom_fields: customFields,
        stripe_price_id: stripePriceId || undefined,
      });
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel animate-scale-in" style={{ maxWidth: '800px', width: '90%' }}>
        <div className="modal-header">
          <span className="modal-icon"><ShoppingBag size={22} /></span>
          <h2>{initial ? 'Editar Producto' : 'Nuevo Producto'}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body-split">
          {/* Main Info */}
          <form onSubmit={handleSubmit} className="modal-body">
            <div className="modal-preview-row">
              <div className="modal-image-preview">
                {imageUrl
                  ? <img src={imageUrl} alt="preview" onError={e => { e.currentTarget.src = ''; }} />
                  : <div className="preview-placeholder"><ShoppingBag size={40} /></div>
                }
              </div>
              <div className="modal-main-fields">
                <div className="form-group">
                  <label>Nombre del Producto *</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Camiseta Oficial 2025" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Precio (€) *</label>
                    <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="16.50" />
                  </div>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>URL de Imagen *</label>
              <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
            </div>

            <div className="form-group">
              <label>Descripción</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Descripción del producto, materiales, etc." />
            </div>

            <hr style={{ margin: '1rem 0', borderColor: '#eee' }} />

            <div style={{ display: 'flex', gap: '2rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Variables del Producto (Campos Dinámicos)</label>
                <div style={{ background: 'rgba(255,255,255,0.06)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', marginBottom: '1rem' }}>
                  {customFields.length === 0 ? <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' }}>No hay variables mapeadas.</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {customFields.map((field, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.08)', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <span style={{ fontSize: '0.85rem', color: '#ddd' }}>
                            <strong style={{ color: '#fff' }}>{field.name}</strong> {field.required ? '*' : ''} 
                            <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: '6px' }}>({field.type === 'text' ? 'Texto' : 'Opciones'})</span>
                          </span>
                          <button type="button" onClick={() => setCustomFields(prev => prev.filter((_, idx) => idx !== i))} style={{ color: '#ff6b6b', background: 'none', border: 'none', cursor: 'pointer' }}><Trash2 size={16} /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                    <h5 style={{ marginBottom: '8px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>Añadir Propiedad (ej. Talla, Jugador...)</h5>
                    <input type="text" placeholder="Nombre (Ej. Talla)" style={{ width: '100%', marginBottom: '8px', padding: '8px 12px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} value={newFieldName} onChange={e => setNewFieldName(e.target.value)} />
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <select value={newFieldType} onChange={e => setNewFieldType(e.target.value as any)} style={{ padding: '8px', fontSize: '0.85rem', flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}>
                        <option value="text">Input de Texto (Libre)</option>
                        <option value="categorical">Opciones (Selectores)</option>
                      </select>
                      <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', gap: '4px', color: 'rgba(255,255,255,0.6)' }}>
                        <input type="checkbox" checked={newFieldReq} onChange={e => setNewFieldReq(e.target.checked)} />
                        Requerido
                      </label>
                    </div>

                    {newFieldType === 'categorical' && (
                      <div style={{ marginBottom: '8px', padding: '10px', background: 'rgba(212,175,55,0.08)', borderRadius: '6px', border: '1px solid rgba(212,175,55,0.2)' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          {newFieldOptions.map(opt => <span key={opt} style={{ background: 'rgba(212,175,55,0.15)', padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37' }}>{opt}</span>)}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input type="text" placeholder="Ej. L" value={newFieldOptionText} onChange={e=>setNewFieldOptionText(e.target.value)} style={{ padding: '6px 10px', fontSize: '0.8rem', flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff' }} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomFieldOption())}/>
                          <button type="button" onClick={addCustomFieldOption} style={{ padding: '6px 12px', background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '6px', color: '#d4af37', cursor: 'pointer' }}>+</button>
                        </div>
                      </div>
                    )}
                    
                    <button type="button" onClick={commitNewField} disabled={!newFieldName} style={{ width: '100%', fontSize: '0.8rem', padding: '8px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '8px', color: '#d4af37', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}>
                      Añadir Campo
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {error && <p className="modal-error">{error}</p>}

            <div className="modal-actions">
              <button type="button" onClick={onClose} className="btn-modal-cancel">Cancelar</button>
              <button type="submit" className="btn-modal-save" disabled={saving}>
                {saving ? 'Guardando...' : initial ? 'Guardar Cambios' : 'Crear Producto'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Needed imported trash icon for the dynamic array slice visually
function Trash2({ size }: { size: number }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>;
}
