import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from './presentation/store';
import { Navbar } from './presentation/Navbar';
import { Footer } from './presentation/Footer';
import { Home } from './presentation/Home';
import { Login } from './presentation/Login';
import { Market } from './presentation/Market';
import { Events } from './presentation/Events';
import { Clasificaciones } from './presentation/Clasificaciones';
import { AdminPanel } from './presentation/AdminPanel';
import { PrivacyPolicy } from './presentation/PrivacyPolicy';
import { LegalNotice } from './presentation/LegalNotice';
import { CookiesPolicy } from './presentation/CookiesPolicy';
import { CookieBanner } from './presentation/CookieBanner';

function TelemetryTracker() {
  const { logActivity } = useStore();
  const location = useLocation();
  
  useEffect(() => {
    logActivity('page_visit', { path: location.pathname });
  }, [location, logActivity]);
  
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
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Navbar />
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/market" element={<Market />} />
            <Route path="/events" element={<Events />} />
            <Route path="/clasificaciones" element={<Clasificaciones />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/login" element={<Login />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/legal" element={<LegalNotice />} />
            <Route path="/cookies" element={<CookiesPolicy />} />
          </Routes>
        </main>
        <Footer />
        <CookieBanner />
      </div>
    </BrowserRouter>
  );
  );
}
export default App;
