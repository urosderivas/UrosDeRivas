import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, currentTheme, systemTheme, THEME_KEY, type Theme } from '../../utils/theme';

/**
 * Botón de la cabecera para cambiar entre tema claro y oscuro. Por defecto se sigue el
 * tema del móvil u ordenador; si se elige el otro, se recuerda en este navegador. Volver
 * a elegir el del sistema borra la elección, y la web vuelve a seguirlo.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(THEME_KEY); } catch { /* sin almacenamiento */ }
      if (saved) return;
      applyTheme(systemTheme());
      setTheme(systemTheme());
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    try {
      if (next === systemTheme()) localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch { /* sin almacenamiento: dura hasta recargar */ }
    applyTheme(next);
    setTheme(next);
  };

  const label = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  return (
    <button type="button" className="nav-theme" onClick={toggle} title={label} aria-label={label}>
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
