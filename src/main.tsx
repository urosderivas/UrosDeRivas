import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Tras publicar una versión nueva, una pestaña abierta puede pedir trozos de la
// web que ya no existen (el panel, el PDF…): se recarga para coger la versión nueva.
// Solo una vez por minuto, para no entrar en bucle si el fallo es de red.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('chunk_reload_at') || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('chunk_reload_at', String(Date.now()));
  } catch { return; }
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
