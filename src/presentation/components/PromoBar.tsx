import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SupabaseAdapter } from '../../infrastructure/SupabaseAdapter';
import { PROMO_MESSAGES } from '../../config';
import { eventPath } from '../../utils/eventLinks';
import './PromoBar.css';

const adapter = new SupabaseAdapter();
const ROTATE_MS = 5000;

/** Barra fina de avisos encima de la cabecera: campus, torneos y viajes abiertos y avisos fijos, uno cada vez. */
export function PromoBar() {
  const [messages, setMessages] = useState(PROMO_MESSAGES);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    adapter.getEvents()
      .then(events => {
        const open = events
          .filter(e => e.active)
          .map(e => ({ text: `Inscripciones abiertas: ${e.title}`, to: eventPath(e) }));
        setMessages([...open, ...PROMO_MESSAGES]);
      })
      .catch(() => { /* sin eventos, quedan los avisos fijos */ });
  }, []);

  useEffect(() => {
    if (messages.length < 2) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % messages.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [messages.length]);

  const current = messages[index % messages.length];
  if (!current) return null;

  return (
    <div className="promo-bar" role="status">
      <span key={index} className="promo-message">
        {current.to ? <Link to={current.to}>{current.text} →</Link> : current.text}
      </span>
    </div>
  );
}
