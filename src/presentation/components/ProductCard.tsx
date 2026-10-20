import { ReactNode } from 'react';
import { MarketItem } from '../../domain/entities';
import { fallbackImageUrl, resolveImageUrl, showFallbackImage } from '../../utils/media';

/** Ficha de producto de la tienda y de la portada: foto grande, nombre, precio y botón. */
export function ProductCard({ item, onOpen, adminActions }: { item: MarketItem; onOpen: () => void; adminActions?: ReactNode }) {
  return (
    <div className="product-card animate-fade-in" onClick={onOpen}
      role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}>
      {adminActions}
      <div className="product-image-wrap">
        <img src={item.imageUrl ? resolveImageUrl(item.imageUrl) : fallbackImageUrl} alt={item.name}
          className="product-img" loading="lazy" onError={showFallbackImage} />
      </div>
      <div className="product-info">
        <h3 className="product-name">{item.name.trim()}</h3>
        {item.description && <p className="product-desc">{item.description}</p>}
        <span className="product-price">{item.price.toFixed(2)} €</span>
        <span className="btn-buy product-open">Ver producto</span>
      </div>
    </div>
  );
}
