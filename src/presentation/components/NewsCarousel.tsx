import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const AUTOPLAY_MS = 6000;
// En el móvil las noticias van una debajo de otra (ver Home.css)
const DESKTOP_QUERY = '(min-width: 601px)';

/**
 * Fila de noticias en el ordenador: centrada si caben todas y, si no, carrusel
 * que avanza solo (se para al pasar el ratón) con flechas para moverlo a mano.
 */
export function NewsCarousel({ children, count }: { children: ReactNode; count: number }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [paused, setPaused] = useState(false);

  // ¿Hay más noticias de las que caben? Se recalcula al cambiar el tamaño
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => setOverflowing(window.matchMedia(DESKTOP_QUERY).matches && track.scrollWidth > track.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [count]);

  const step = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const amount = (card?.offsetWidth || track.clientWidth) + gap;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    const atStart = track.scrollLeft <= 2;
    if (direction === 1 && atEnd) track.scrollTo({ left: 0, behavior: 'smooth' });
    else if (direction === -1 && atStart) track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' });
    else track.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }, []);

  // Avance automático, salvo con el ratón encima o si el sistema pide menos movimiento
  useEffect(() => {
    if (!overflowing || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') step(1);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [overflowing, paused, step]);

  return (
    <div className={`news-carousel ${overflowing ? 'is-overflowing' : ''}`}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
      {overflowing && (
        <button type="button" className="news-arrow prev" onClick={() => step(-1)} aria-label="Noticia anterior">
          <ChevronLeft size={22} />
        </button>
      )}
      <div className="news-track" ref={trackRef}>
        {children}
      </div>
      {overflowing && (
        <button type="button" className="news-arrow next" onClick={() => step(1)} aria-label="Noticia siguiente">
          <ChevronRight size={22} />
        </button>
      )}
    </div>
  );
}
