import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from './presentation/store';
import { Navbar } from './presentation/Navbar';
import { Footer } from './presentation/Footer';
import { Home } from './presentation/Home';
import { Login } from './presentation/Login';
import { Market } from './presentation/Market';
import { Events } from './presentation/Events';
import { Sponsors } from './presentation/Sponsors';
import { Clasificaciones } from './presentation/Clasificaciones';
import { AdminPanel } from './presentation/AdminPanel';
import { PrivacyPolicy } from './presentation/PrivacyPolicy';
import { LegalNotice } from './presentation/LegalNotice';
import { CookiesPolicy } from './presentation/CookiesPolicy';
import { CookieBanner } from './presentation/CookieBanner';
import { NotFound } from './presentation/NotFound';
import { consumePasswordRecovery, PASSWORD_RECOVERY_EVENT } from './utils/supabase';
import { takeLoginNext } from './utils/loginRedirect';

function TelemetryTracker() {
  const { logActivity } = useStore();
  const location = useLocation();
  
  useEffect(() => {
    // Solo se registran visitas si el usuario ha aceptado las cookies de estadística
    let consent: string | null = null;
    try { consent = localStorage.getItem('cookie_banner_accepted'); } catch { /* sin almacenamiento */ }
    if (consent !== 'true') return;
    logActivity('page_visit', { path: location.pathname });
  }, [location, logActivity]);
  
  return null;
}

// Redirecciones que llegan desde fuera de la web: el enlace de recuperar
// contraseña lleva a la pantalla de nueva contraseña, y al volver de Google se
// vuelve a la página desde la que se pidió iniciar sesión.
function AuthRedirects() {
  const { user } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    const goToReset = () => {
      if (consumePasswordRecovery()) navigate('/login?mode=reset', { replace: true });
    };
    goToReset();
    window.addEventListener(PASSWORD_RECOVERY_EVENT, goToReset);
    return () => window.removeEventListener(PASSWORD_RECOVERY_EVENT, goToReset);
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    const next = takeLoginNext();
    if (next) navigate(next, { replace: true });
  }, [user, navigate]);

  return null;
}

function App() {
  const { initAuth } = useStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <TelemetryTracker />
      <AuthRedirects />
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navbar />
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/market" element={<Market />} />
            <Route path="/events" element={<Events />} />
            <Route path="/sponsors" element={<Sponsors />} />
            <Route path="/clasificaciones" element={<Clasificaciones />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/login" element={<Login />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/legal" element={<LegalNotice />} />
            <Route path="/cookies" element={<CookiesPolicy />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <Footer />
        <CookieBanner />
      </div>
    </BrowserRouter>
  );
}
export default App;
