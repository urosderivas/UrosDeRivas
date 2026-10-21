import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { Modal } from './components/Modal';
import { RichText } from './components/RichText';
import { MarketItem } from '../domain/entities';
import { fallbackImageUrl, resolveImageUrl, showFallbackImage } from '../utils/media';

interface Props {
  item: MarketItem | null;
  isLoggedIn: boolean;
  buying: boolean;
  onClose: () => void;
  onAddToCart: (item: MarketItem, options: Record<string, string>) => void;
  onBuyNow: (item: MarketItem, options: Record<string, string>) => void;
}

/** Tallas antiguas (columna sizes) como campo obligatorio, si el producto no tiene ya uno "Talla". */
function legacySizes(item: MarketItem): string[] {
  if (!item.sizes || item.sizes.length === 0) return [];
  if (item.custom_fields?.some(c => c.name === 'Talla')) return [];
  return item.sizes;
}

/** Ventana de compra: foto, descripción completa y las opciones (talla, datos) del producto. */
export function ProductModal({ item, isLoggedIn, buying, onClose, onAddToCart, onBuyNow }: Props) {
  const [options, setOptions] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  useEffect(() => { setOptions({}); setError(''); }, [item?.id]);

  if (!item) return null;

  const sizes = legacySizes(item);
  const setOption = (key: string, value: string) => {
    setOptions(prev => ({ ...prev, [key]: value }));
    setError('');
  };

  // Devuelve las opciones si están todas las obligatorias; si no, avisa de la primera que falta
  const validOptions = (): Record<string, string> | null => {
    if (sizes.length > 0 && !options['Talla']) { setError('Elige una talla.'); return null; }
    for (const field of item.custom_fields || []) {
      if (field.required && !options[field.name]?.trim()) {
        setError(`Falta "${field.name}".`);
        return null;
      }
    }
    return options;
  };

  return (
    <Modal isOpen onClose={onClose} title={item.name} icon={<ShoppingBag size={22} />} maxWidth="760px">
      <div className="product-modal">
        <div className="product-modal-image">
          <img src={item.imageUrl ? resolveImageUrl(item.imageUrl) : fallbackImageUrl} alt={item.name} onError={showFallbackImage} />
        </div>

        <div className="product-modal-info">
          <span className="product-modal-price">{item.price.toFixed(2)} €</span>
          {item.description && <RichText text={item.description} className="product-modal-desc" />}

          {sizes.length > 0 && (
            <div className="var-group">
              <label className="var-label">Talla *</label>
              <div className="sizes-grid">
                {sizes.map(s => (
                  <button key={s} type="button" onClick={() => setOption('Talla', s)}
                    className={`market-size-chip ${options['Talla'] === s ? 'active' : ''}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(item.custom_fields || []).map(field => (
            <div key={field.name} className="var-group">
              <label className="var-label">{field.name} {field.required && '*'}</label>
              {field.type === 'categorical' ? (
                <div className="sizes-grid">
                  {(field.options || []).map(opt => (
                    <button key={opt} type="button" onClick={() => setOption(field.name, opt)}
                      className={`market-size-chip ${options[field.name] === opt ? 'active' : ''}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <input type="text" className="market-text-input" maxLength={100}
                  value={options[field.name] || ''} onChange={e => setOption(field.name, e.target.value)} />
              )}
            </div>
          ))}

          {error && <p className="modal-error">{error}</p>}

          {isLoggedIn ? (
            <div className="product-modal-actions">
              <button className="btn-add-cart" onClick={() => { const o = validOptions(); if (o) onAddToCart(item, o); }}>
                Añadir al carrito
              </button>
              <button className="btn-buy" disabled={buying} onClick={() => { const o = validOptions(); if (o) onBuyNow(item, o); }}>
                {buying ? 'Redirigiendo...' : 'Comprar ahora'}
              </button>
            </div>
          ) : (
            <div className="product-modal-actions">
              <Link to={`/login?next=${encodeURIComponent('/market')}`} className="btn-buy">Inicia sesión para comprar</Link>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
