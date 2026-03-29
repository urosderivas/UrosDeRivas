import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './Home.css';

export function Home() {
  const sponsorsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observerOptions = {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    const revealElements = document.querySelectorAll('.reveal-item');
    revealElements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <div className="home-container">
      <section className="hero-section">
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <h2 className="hero-title">CLUB DEPORTIVO ELEMENTAL UROS DE RIVAS</h2>
          <p className="hero-subtitle">Únete a la familia Uros de Rivas. El mejor baloncesto local.</p>
          <div className="hero-buttons">
            <Link to="/events" className="btn-primary">Ir a Campus</Link>
            <Link to="/market" className="btn-secondary">Tienda Oficial</Link>
          </div>
        </div>
        <div className="scroll-indicator">
          <i className="fas fa-chevron-down"></i>
          <span>↓</span>
        </div>
      </section>

      <section className="sponsors-section">
        <div className="sponsors-header reveal-item">
          <h3>PATROCINADORES y COLABORADORES</h3>
          <p className="sponsors-subtitle">Estamos muy agradecidos a todos los Patrocinadores y Colaboradores, pues sin ellos no seríamos lo que somos y los que somos. ¡Esperamos seguir creciendo!</p>
        </div>
        <div className="sponsors-container" ref={sponsorsRef}>
          <div className="sponsors-grid">
            {[
              { img: 'everest.jpg', link: 'http://www.clinicadentaleverest.es/#content-content-inner', alt: 'Everest Clínica Dental' },
              { img: 'dominos-1-copy.jpg', link: 'https://www.dominospizza.es/', alt: 'Dominos Pizza' },
              { img: 'Secomoto-1-copy.jpg', link: 'https://www.secomoto.com/', alt: 'Secomoto' },
              { img: 'Compo-web-copy-300x250.jpg', link: 'https://www.jarmauto.es/', alt: 'Jarmauto' },
              { img: 'watan-copy-300x250.jpg', link: 'https://www.google.com/maps/place/Fisioterapia+Watan/@40.3540074', alt: 'Fisioterapia Watan' },
              { img: 'Hospivet-1-300x250.jpg', link: 'http://www.hospivetrivas.es/', alt: 'Hospivet Rivas' },
              { img: 'Papeleria-Numeros-copy-300x250.jpg', link: 'https://www.google.com/maps/place/Librer%C3%ADa+NUMEROS/@40.3609267', alt: 'Librería Números' },
              { img: 'Altafit-300x250.jpg', link: 'https://altafitgymclub.com/gimnasios/madrid-rivas/', alt: 'Altafit Gym' },
              { img: 'rotusil_logo_web-300x160.png', link: 'http://rotusil.com/', alt: 'Rotusil' },
              { img: 'asisa.jpg', link: 'https://www.asisa.es/seguros-de-salud', alt: 'Asisa' },
              { img: 'Ferrual-300x250.jpg', link: 'http://www.ferrual.com/', alt: 'Ferrual' },
              { img: 'Educatech-copy-300x250.jpg', link: 'https://www.facebook.com/academiaeducatech/', alt: 'Academia Educatech' },
              { img: 'Atmosfera-300x150-300x250.jpg', link: 'https://www.atmosferasport.es', alt: 'Atmosfera Sport' },
              { img: 'AquaCare-300x150-300x250.jpg', link: 'https://www.aquacarerivas.com/', alt: 'AquaCare Rivas' },
              { img: 'Somos-300x150-300x250.jpg', link: 'http://somosfisioterapiarivas.com/', alt: 'Somos Fisioterapia' },
              { img: 'Mas-q-manitas-300x150-300x250.jpg', link: 'http://www.masqmanitas.es/paginas/introduccion.html', alt: 'Mas q Manitas' },
              { img: 'moyra-300x150-300x250.jpg', link: 'https://www.centroestudiosmoyra.es/', alt: 'Centro Estudios Moyra' },
              { img: 'Picco-300x150-300x250.jpg', link: 'https://www.doctoraanaluciapiccolaskowski.es/es/', alt: 'Dra. Ana Lucia Picco' },
              { img: 'Ruben-300x150-300x250.jpg', link: 'http://www.libreriaruben.com/', alt: 'Librería Rubén' },
              { img: 'Fast-300x150-300x250.jpg', link: 'http://fastmotor.cuidamostucoche.com/', alt: 'Fast Motor' },
              { img: 'Academia-Nar-300x150-300x250.jpg', link: 'https://www.google.com/maps/place/Academia+Naranjo/@40.3256751,-3.5164271', alt: 'Academia Naranjo' },
              { img: 'Universal-300x150-300x250.jpg', link: 'https://www.google.com/maps/place/Autoescuela+Universal/@40.3291921,-3.5120691', alt: 'Autoescuela Universal' },
              { img: 'Especialidades-300x150-300x250.jpg', link: 'https://www.odontologosrivas.com/', alt: 'Odontólogos Rivas' },
            ].map((s, idx) => (
              <a
                key={idx}
                href={s.link}
                target="_blank"
                rel="noopener noreferrer"
                className="sponsor-item reveal-item"
              >
                <img src={`${import.meta.env.BASE_URL}assets/sponsors/${s.img}`} alt={s.alt} onError={e => e.currentTarget.style.display = 'none'} />
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
