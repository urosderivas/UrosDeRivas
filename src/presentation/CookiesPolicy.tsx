import './PolicyPages.css';

export function CookiesPolicy() {
  return (
    <div className="policy-container">
      <div className="policy-content">
        <h1>Política de cookies</h1>
        
        <h2>INFORMACIÓN SOBRE COOKIES</h2>
        <p>
          Debido a la entrada en vigor de la referente modificación de la «Ley de Servicios de la Sociedad de la Información» (LSSICE) establecida por el Real Decreto 13/2012, es de obligación obtener el consentimiento expreso del usuario de todas las páginas web que usan cookies prescindibles, antes de que este navegue por ellas.
        </p>

        <h2>¿QUÉ SON LAS COOKIES?</h2>
        <p>
          Las cookies y otras tecnologías similares tales como local shared objects, flash cookies o píxeles, son herramientas empleadas por los servidores Web para almacenar y recuperar información acerca de sus visitantes, así como para ofrecer un correcto funcionamiento del sitio.
        </p>

        <h2>COOKIES AFECTADAS POR LA NORMATIVA Y COOKIES EXCEPTUADAS</h2>
        <p>
          Según la directiva de la UE, las cookies que requieren el consentimiento informado por parte del usuario son las cookies de analítica y las de publicidad y afiliación, quedando exceptuadas las de carácter técnico y las necesarias para el funcionamiento del sitio web o la prestación de servicios expresamente solicitados por el usuario.
        </p>

        <h2>TIPOS DE COOKIES SEGÚN LA FINALIDAD</h2>
        <ul>
          <li><strong>Cookies técnicas y funcionales:</strong> son aquellas que permiten al usuario la navegación a través de una página web, plataforma o aplicación y la utilización de las diferentes opciones o servicios que en ella existan.</li>
          <li><strong>Cookies analíticas:</strong> permiten el seguimiento y análisis del comportamiento de los usuarios (como Google Analytics).</li>
          <li><strong>Cookies publicitarias:</strong> permiten la gestión de espacios publicitarios.</li>
          <li><strong>Cookies sociales:</strong> establecidas por las plataformas de redes sociales para permitir compartir contenido.</li>
          <li><strong>Cookies de afiliación y de seguridad.</strong></li>
        </ul>

        <h2>TRATAMIENTO DE DATOS PERSONALES</h2>
        <p>
          <strong>C.B. Uros de Rivas</strong> es el Responsable del tratamiento de los datos personales del Interesado y le informa de que estos datos serán tratados de conformidad con lo dispuesto en el Reglamento (UE) 2016/679 (GDPR).
        </p>
        <p>
          <strong>Fines del tratamiento:</strong> asegurar la correcta navegación, obtener métricas anónimas sobre el desempeño de la web y en su caso permitir compartir a través de redes sociales y medir nuestra publicidad.
        </p>
        <p>
          <strong>Legitimación del tratamiento:</strong> consentimiento del interesado, salvo para las cookies de estricta necesidad técnica o de servicio solicitado.
        </p>
        
        <h2>COOKIES UTILIZADAS EN ESTE SITIO WEB</h2>
        <table className="cookies-table">
          <thead>
            <tr>
              <th>Nombre de la Cookie</th>
              <th>Propietario</th>
              <th>Finalidad</th>
              <th>Retención</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="mobile-label">Nombre de la Cookie</span>
                <code>sb-osekoolekqyzbpepyxze-auth-token</code>
              </td>
              <td>
                <span className="mobile-label">Propietario</span>
                Tercero (Supabase)
              </td>
              <td>
                <span className="mobile-label">Finalidad</span>
                Cookie técnica necesaria para la autenticación de usuarios inscritos en el club.
              </td>
              <td>
                <span className="mobile-label">Retención</span>
                Sesión / Persistente
              </td>
            </tr>
            <tr>
              <td>
                <span className="mobile-label">Nombre de la Cookie</span>
                <code>cookie_banner_accepted</code>
              </td>
              <td>
                <span className="mobile-label">Propietario</span>
                Propia
              </td>
              <td>
                <span className="mobile-label">Finalidad</span>
                Cookie técnica para recordar si el usuario ha aceptado el aviso de cookies, evitando mostrarlo repetidamente.
              </td>
              <td>
                <span className="mobile-label">Retención</span>
                1 año
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
