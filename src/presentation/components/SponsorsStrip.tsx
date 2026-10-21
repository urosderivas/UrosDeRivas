import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SupabaseAdapter } from '../../infrastructure/SupabaseAdapter';
import { Sponsor } from '../../domain/entities';
import { resolveImageUrl } from '../../utils/media';
import './SponsorsStrip.css';

const adapter = new SupabaseAdapter();
// Segundos que tarda cada logo en cruzar: la velocidad no cambia con el número de patrocinadores
const SECONDS_PER_SPONSOR = 3;

/**
 * Cinta de patrocinadores encima del pie, girando en el orden de la página de
 * Patrocinadores. No sale en esa página (sería repetirla) ni en el panel de admin.
 */
export function SponsorsStrip() {
  const { pathname } = useLocation();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);

  useEffect(() => {
    adapter.getSponsors()
      .then(list => setSponsors(list.filter(s => s.active && s.imageUrl)))
      .catch(e => console.error('Failed to load sponsors', e));
  }, []);

  if (sponsors.length === 0 || pathname.startsWith('/sponsors') || pathname.startsWith('/admin')) return null;

  // La lista va dos veces seguidas: al llegar a la mitad, la animación vuelve al principio sin que se note
  const loop = [...sponsors, ...sponsors];

  return (
    <section className="sponsors-strip" aria-label="Patrocinadores">
      <div className="sponsors-strip-head">
        <h3>Nuestros patrocinadores</h3>
        <Link to="/sponsors">Ver todos →</Link>
      </div>
      <div className="sponsors-strip-viewport">
        <div className="sponsors-strip-track" style={{ animationDuration: `${sponsors.length * SECONDS_PER_SPONSOR}s` }}>
          {loop.map((s, i) => (
            <a key={`${s.id}-${i}`} className="sponsors-strip-item" href={s.linkUrl || undefined}
              target="_blank" rel="noopener noreferrer" title={s.name}
              aria-hidden={i >= sponsors.length} tabIndex={i >= sponsors.length ? -1 : undefined}>
              <img src={resolveImageUrl(s.imageUrl)} alt={s.name} loading="lazy" onError={e => e.currentTarget.style.display = 'none'} />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
