import { useState, useEffect } from 'react';
import { X, Plus, ShoppingBag } from 'lucide-react';
import { MarketItem } from '../domain/entities';
import './MarketItemModal.css';

const PRESET_SIZES = ['5/6', '7/8', '9/11', '12/14', '16', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

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
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [customSize, setCustomSize] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setPrice(String(initial.price));
      setImageUrl(initial.imageUrl);
      setDescription(initial.description || '');
      setStripePriceId(initial.stripe_price_id || '');
      setSelectedSizes(initial.sizes || []);
    } else {
      setName(''); setPrice(''); setImageUrl(''); setDescription('');
      setStripePriceId(''); setSelectedSizes([]);
    }
    setError('');
  }, [initial, isOpen]);

  const toggleSize = (s: string) => {
    setSelectedSizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const addCustomSize = () => {
    const trimmed = customSize.trim().toUpperCase();
    if (trimmed && !selectedSizes.includes(trimmed)) {
      setSelectedSizes(prev => [...prev, trimmed]);
    }
    setCustomSize('');
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
        sizes: selectedSizes,
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
      <div className="modal-panel animate-scale-in">
        <div className="modal-header">
          <span className="modal-icon"><ShoppingBag size={22} /></span>
          <h2>{initial ? 'Editar Producto' : 'Nuevo Producto'}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

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
                <div className="form-group">
                  <label>Stripe Price ID <span className="label-hint">(opcional)</span></label>
                  <input value={stripePriceId} onChange={e => setStripePriceId(e.target.value)} placeholder="price_1..." />
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

          <div className="form-group">
            <label>Tallas Disponibles</label>
            <div className="sizes-grid">
              {PRESET_SIZES.map(s => (
                <button key={s} type="button"
                  className={`size-chip ${selectedSizes.includes(s) ? 'active' : ''}`}
                  onClick={() => toggleSize(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="custom-size-row">
              <input value={customSize} onChange={e => setCustomSize(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSize())}
                placeholder="Talla personalizada..." />
              <button type="button" onClick={addCustomSize}><Plus size={16} /></button>
            </div>
            {selectedSizes.length > 0 && (
              <div className="selected-sizes">
                {selectedSizes.map(s => (
                  <span key={s} className="selected-size-tag">
                    {s}
                    <button type="button" onClick={() => toggleSize(s)}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
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
  );
}
