// Tema claro u oscuro. index.html lo pone antes de pintar la página (sin parpadeo);
// el botón de la cabecera lo cambia con applyTheme.
export type Theme = 'light' | 'dark';
export const THEME_KEY = 'theme';

const BAR_COLOR: Record<Theme, string> = { dark: '#000000', light: '#f2f7f7' };

export const systemTheme = (): Theme =>
  window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

export const currentTheme = (): Theme =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[theme]);
}
