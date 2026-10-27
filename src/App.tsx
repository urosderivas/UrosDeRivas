import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { useStore } from './presentation/store';
import { Navbar } from './presentation/Navbar';
import { PromoBar } from './presentation/components/PromoBar';
import { SponsorsStrip } from './presentation/components/SponsorsStrip';
import { Footer } from './presentation/Footer';
import { Home } from './presentation/Home';
import { Login } from './presentation/Login';
import { Market } from './presentation/Market';
import { Events } from './presentation/Events';
import { Sponsors } from './presentation/Sponsors';
import { PrivacyPolicy } from './presentation/PrivacyPolicy';
import { LegalNotice } from './presentation/LegalNotice';
import { CookiesPolicy } from './presentation/CookiesPolicy';
import { CookieBanner } from './presentation/CookieBanner';
import { NotFound } from './presentation/NotFound';
import { consumeExpiredEmailLink, consumePasswordRecovery, PASSWORD_RECOVERY_EVENT } from './utils/supabase';
import { takeLoginNext } from './utils/loginRedirect';
import { FEATURES } from './config';

// El panel (con el PDF, el Excel y el escáner QR) solo lo descargan los admins
const AdminPanel = lazy(() => import('./presentation/AdminPanel').then(m => ({ default: m.AdminPanel })));
const Appointments = lazy(() => import('./presentation/Appointments').then(m => ({ default: m.Appointments })));

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
    if (consumeExpiredEmailLink()) navigate('/login?link=expired', { replace: true });
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
        <PromoBar />
        <Navbar />
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/market" element={<Market />} />
            <Route path="/events" element={<Events key="campus" kind="campus" />} />
            <Route path="/torneos" element={<Events key="torneo" kind="torneo" />} />
            <Route path="/sponsors" element={<Sponsors />} />
            <Route path="/citas" element={FEATURES.appointments
              ? <Suspense fallback={<p style={{ textAlign: 'center', padding: '3rem' }}>Cargando…</p>}><Appointments /></Suspense>
              : <Navigate to="/" replace />} />
            <Route path="/admin" element={<Suspense fallback={<p style={{ textAlign: 'center', padding: '3rem' }}>Cargando…</p>}><AdminPanel /></Suspense>} />
            <Route path="/login" element={<Login />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/legal" element={<LegalNotice />} />
            <Route path="/cookies" element={<CookiesPolicy />} />
            {/* Sección retirada: los enlaces antiguos llevan a Inicio */}
            <Route path="/clasificaciones" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <SponsorsStrip />
        <Footer />
        <CookieBanner />
      </div>
    </BrowserRouter>
  );
}
export default App;
