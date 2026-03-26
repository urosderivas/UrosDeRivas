import { Link } from 'react-router-dom';
import './Home.css';

export function Home() {
  return (
    <div className="home-container">
      <section className="hero-section">
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <h1 className="hero-title">SIEMPRE LUCHANDO</h1>
          <p className="hero-subtitle">Únete a la familia Uros de Rivas. El mejor baloncesto local.</p>
          <div className="hero-buttons">
            <Link to="/events" className="btn-primary">Ver Calendario</Link>
            <Link to="/market" className="btn-secondary">Tienda Oficial</Link>
          </div>
        </div>
      </section>
      
      <section className="latest-features">
        <h2>ÚLTIMAS NOTICIAS</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-img" style={{ backgroundImage: `url('${import.meta.env.BASE_URL}assets/bull_black.jpeg')` }}></div>
            <div className="feature-content">
              <h3>Inscripciones Abiertas</h3>
              <p>Reserva la plaza para las escuelas municipales y nuestro Campus de Verano.</p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-img" style={{ backgroundImage: `url('${import.meta.env.BASE_URL}assets/bull_white.jpeg')` }}></div>
            <div className="feature-content">
              <h3>Tienda Oficial 24/25</h3>
              <p>Hazte con la nueva equipación. Colores principales y vestimenta de entrenamiento.</p>
            </div>
          </div>
          <div className="feature-card">
            <div className="feature-img" style={{ backgroundImage: `url('${import.meta.env.BASE_URL}assets/bull_black.jpeg')` }}></div>
            <div className="feature-content">
              <h3>Pruebas de Nivel</h3>
              <p>Apúntate a las pruebas que se celebrarán en el Pabellón Cerro del Telégrafo.</p>
            </div>
          </div>
        </div>
      </section>
      
      <section className="sponsors-section">
        <h3>NUESTROS PATROCINADORES</h3>
        <div className="sponsors-track">
          <img src={`${import.meta.env.BASE_URL}assets/sponsor_jarmauto.jpg`} alt="Jarmauto" onError={e => e.currentTarget.style.display='none'} />
          <img src={`${import.meta.env.BASE_URL}assets/sponsor_rotusil.jpg`} alt="Rotusil" onError={e => e.currentTarget.style.display='none'} />
          <img src={`${import.meta.env.BASE_URL}assets/sponsor_clinica_everest.jpg`} alt="Everest Clínica Dental" onError={e => e.currentTarget.style.display='none'} />
          <img src={`${import.meta.env.BASE_URL}assets/sponsor_ferrual.jpg`} alt="Ferrual" onError={e => e.currentTarget.style.display='none'} />
          <img src={`${import.meta.env.BASE_URL}assets/sponsor_alquiler_de_maquinaria.jpg`} alt="Alquiler Maquinaria" onError={e => e.currentTarget.style.display='none'} />
        </div>
      </section>
    </div>
  );
}
