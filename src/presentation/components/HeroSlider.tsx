import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface HeroSlide {
  key: string;
  image: string;
  kicker?: string;
  title: string;
  text?: string;
  buttons: { label: string; to: string; primary?: boolean }[];
}

const AUTOPLAY_MS = 6000;

/** Banner grande de portada: pasa solo entre las diapositivas, con puntos y flechas. */
export function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [count, paused]);

  useEffect(() => { if (index >= count) setIndex(0); }, [index, count]);

  const go = (direction: 1 | -1) => setIndex(i => (i + direction + count) % count);

  return (
    <section className="hero-slider" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {slides.map((slide, i) => (
        <div key={slide.key} className={`hero-slide ${i === index ? 'active' : ''}`} aria-hidden={i !== index}>
          <div className="hero-slide-bg" style={{ backgroundImage: `url("${slide.image}")` }} />
          <div className="hero-slide-shade" />
          <div className="hero-slide-content">
            {slide.kicker && <p className="hero-kicker">{slide.kicker}</p>}
            <h2 className="hero-slide-title">{slide.title}</h2>
            {slide.text && <p className="hero-slide-text">{slide.text}</p>}
            <div className="hero-slide-buttons">
              {slide.buttons.map(b => (
                <Link key={b.to} to={b.to} tabIndex={i === index ? 0 : -1}
                  className={b.primary ? 'hero-btn hero-btn-primary' : 'hero-btn hero-btn-ghost'}>{b.label}</Link>
              ))}
            </div>
          </div>
        </div>
      ))}
      {count > 1 && (
        <>
          <button className="hero-arrow prev" onClick={() => go(-1)} aria-label="Anterior"><ChevronLeft size={22} /></button>
          <button className="hero-arrow next" onClick={() => go(1)} aria-label="Siguiente"><ChevronRight size={22} /></button>
          <div className="hero-dots">
            {slides.map((s, i) => (
              <button key={s.key} className={i === index ? 'active' : ''} onClick={() => setIndex(i)} aria-label={`Diapositiva ${i + 1}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
