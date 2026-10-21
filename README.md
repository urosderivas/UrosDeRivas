# 🏀 Plataforma Web Universal para Clubes (Clupik Integration) - Uros de Rivas

Una plataforma frontend de alto rendimiento y estética ultra-premium desarrollada originalmente para el **Club Deportivo Elemental Uros de Rivas**, diseñada desde cero bajo una concepción de Arquitectura Hexagonal y utilizando **React + TypeScript + Vite**.

Este repositorio no solo contiene el ecosistema del club de baloncesto Uros de Rivas, sino que está preparado estructuralmente para servir como **Plantilla Universal (Boilerplate)** Open Source para cualquier otro club deportivo que quiera digitalizar por completo toda su operativa de e-commerce, campuses de verano y visualización de resultados, independientemente de si usa o no la **API de Clupik** 🏆.

## ✨ Capacidades y Nuevas Características Implementadas

El sistema ha evolucionado de un simple visor a una completa **Plataforma de E-Commerce y Gestión de Clubes** integral:

- **E-Commerce y Tienda Nativa:** Sistema de carrito de compras funcional con soporte para variables (tallas, colores) y **campos de texto personalizados** (ej: *Dorsal a imprimir*, *Añadir nombre de Jugador/a*). Todo sincronizado con un backend transaccional.
- **Campus, torneos y viajes con inscripción:** dos pestañas (Campus y Torneos y viajes) que funcionan igual. Soporta:
  - **Tabla de precios:** precio total según nº de asistentes y nº de días (o por evento completo), más una regla fija a partir de la última fila (+X € por asistente y día). La web y el cobro usan el mismo cálculo (`supabase/functions/_shared/pricing.ts`).
  - Generación de formularios personalizados flexibles.
  - Pago con tarjeta (Stripe) verificado en el servidor; los eventos gratis se confirman sin pago.
- **Integración Nativa de Stripe (Serverless):** Checkout integrado mediante **Supabase Edge Functions** (para procesar pagos de Stripe de forma segura y sin exponer tus CLAVES), con un innovador sistema de sincronización *Webhook-less* manual a demanda de la directiva.
- **Panel de Administración Inteligente (Dashboard):** 
  - Gestión integral de **Pedidos** del club y **Asistentes al Campus**.
  - Interfaz de "Sincronización Stripe" en un click: detecta pagos abandonados y confirmados en tiempo real.
  - 📥 **Importador Clupik Directo:** Permite volcar todo tu catálogo de ropa alojado en Clupik a tu base de datos local pre-calculando variables para independizar tu web.
  - 📊 **Exportador Excel (.xlsx):** Descarga de un clic de todos tus clientes, reservas y finanzas estructuradas.
  - 📄 **Generador de Facturas PDF (Anti-falsificación):** Creación de facturas locales instantáneas (jsPDF) insertando metadatos únicos y códigos QR verificables por directiva para pases de Campus o entregas de ropa en mano.
- **Despliegue Cero-Fricciones con GitHub Pages:** Preparado para compilarse y publicarse de manera gratuita y eficiente desde el ecosistema `gh-pages` ahorrando cientos de euros en hosting.

---

## 🛠 Instalación Local (Entorno de Desarrollo)

Si deseas probar la aplicación del equipo localmente, o prepararte para desplegar tu propio club:

1. **Clona el repositorio**
   ```bash
   git clone https://github.com/tuusuario/UrosDeRivas.git
   cd UrosDeRivas
   ```

2. **Instala las dependencias**
   ```bash
   npm install
   ```

3. **Variables de Entorno (Supabase)**
   Crea un archivo llamado `.env` en la carpeta raíz para conectar Front y Backend:
   ```env
   VITE_SUPABASE_URL=https://<TU-ID-SUPABASE>.supabase.co
   VITE_SUPABASE_ANON_KEY=<TU-CLAVE-ANONIMA>
   VITE_STRIPE_PUBLIC_KEY=<TU-CLAVE-PUBLICA-STRIPE>
   ```

4. **Despliegue de Base de Datos y Edge Functions** (Requerido para E-Commerce)

   El esquema completo (tablas, RLS, funciones y triggers) está versionado en `supabase/migrations/`. Cualquier cambio en la base de datos se hace con una migración nueva (`npx supabase migration new <nombre>`), nunca a mano en el panel.
   ```bash
   npx supabase link --project-ref <TU-ID-SUPABASE>
   npx supabase db push
   # Recuerda inyectar tu API Key SECRETA de Stripe en Supabase:
   npx supabase secrets set STRIPE_SECRET_KEY=sk_tc_...
   # Dominios a los que Stripe puede volver tras el pago (separados por comas)
   npx supabase secrets set ALLOWED_ORIGINS=https://tudominio.es,http://localhost:5173
   npx supabase functions deploy create-checkout-session --no-verify-jwt
   npx supabase functions deploy verify-payment --no-verify-jwt
   npx supabase functions deploy stripe-webhook --no-verify-jwt
   ```

   **Webhook de Stripe** (para que los pagos consten al momento, sin pulsar "sincronizar"): en Stripe → Developers → Webhooks, añade el endpoint `https://<TU-ID-SUPABASE>.supabase.co/functions/v1/stripe-webhook` con los eventos `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded` y `checkout.session.async_payment_failed`. Copia su *signing secret* y guárdalo:
   ```bash
   npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   ```

5. **Arranca el Servidor Vite**
   ```bash
   npm run dev
   ```

---

## 🚀 Cómo usar esta plantilla para OTRO Club Deportivo de forma Open Source

La magia de este sistema reside en nuestro adaptador inteligente y su arquitectura acoplable. No necesitas pagar mil herramientas: puedes centralizar las cuotas, el merchandising y tus campus de verano bajo UN ÚNICO entorno sin costes de servidor ni mantenimiento (GitHub Pages + Servidor Supabase Gratuito).

### Paso 1: Configura tu Supabase
Crea un proyecto gratuito en Supabase y aplica las migraciones de `supabase/migrations/` con `npx supabase db push` (o pega `supabase/migrations/20261017000000_baseline.sql` en el *SQL Editor*) para montar todas las tablas del mercado, usuarios y campus. Configura tus secretos de Stripe.

### Paso 2: Cambia tu ID de Clupik (Opcional)
Si tu equipo deportivo pertenece a la red de Clupik (casi todas las federaciones territoriales lo están integrando):
> En `src/config.ts` (`CLUPIK.clubId`), el ID del Uros de Rivas es `67`. Los importadores de tienda y campus del panel de admin lo usan.

### Paso 2 bis: Datos del club
Nombre legal, CIF, dirección, email de contacto e ID de Clupik están en `src/config.ts`. Es el único sitio que hay que tocar si cambia alguno; los textos legales, los justificantes y los importadores de Clupik lo leen de ahí.

El escudo del club es `public/assets/logo_uros.png` (cabecera, pie, portada y justificantes). Para cambiarlo basta con sustituir ese archivo por otro PNG con fondo transparente y el mismo nombre; el icono de la pestaña es `public/assets/favicon.png`.

### Contenido que se gestiona desde la web
Con una cuenta de admin, sin tocar código:
- **Noticias** en Inicio: crear, editar y borrar; cada una puede llevar imagen, enlaces en el texto (`[texto](https://...)`) y un campus, torneo o viaje relacionado.
- **Campus, torneos y viajes**: crear, editar, ocultar y borrar desde su pestaña. Las fechas se añaden de una en una o por rango, y la tabla de precios se puede rellenar rápido (precio por asistente y día) o copiar de otro evento.
- **Patrocinadores** en su propia página: añadir, editar, ocultar, ordenar y borrar.

Las imágenes se suben al bucket público `media` de Supabase Storage (lo crea la migración `20261017120000_sponsors_and_news.sql`) o se puede pegar el enlace de una imagen ya publicada.

### Paso 3: Identidad Corporativa Custom
Las variables fundamentales están centralizadas en `src/index.css`. Sustituye:
```css
  --primary-color: #d4af37; /* El color principal de tu equipo (ej: Naranja, Rojo) */
  --bg-color: #0c0f12;      /* Fondo, compatible con Dark Mode elegante */
```
*Sube los escudos de tu equipo en `public/assets/*` y cambia las referencias principales en el `Navbar.tsx` y `Home.tsx`.*

### Paso 4: Despliegue Público Gratuito y Automatizado
La web se publica sola en GitHub Pages con cada push a `master` (`.github/workflows/deploy.yml`). En los pull requests solo se compila, para avisar si algo se ha roto. Para activarlo una vez:
1. En el repo, **Settings → Pages → Source**: elige *GitHub Actions*.
2. En **Settings → Secrets and variables → Actions → Variables**, crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (la clave pública `sb_publishable_…`).
3. Con dominio propio, crea también la variable `CUSTOM_DOMAIN` (por ejemplo `www.tuclub.es`), apunta el DNS del dominio a GitHub Pages siguiendo [su guía](https://docs.github.com/es/pages/configuring-a-custom-domain-for-your-github-pages-site) y añade el dominio en Settings → Pages. Sin esa variable la web se publica en `https://<organización>.github.io/<repo>/`.
4. Añade la URL final en Supabase (**Authentication → URL Configuration**: *Site URL* y *Redirect URLs*) y en el secreto `ALLOWED_ORIGINS` de las Edge Functions, para que funcionen el login y la vuelta desde Stripe.

Para probar una compilación en local: `npm run build` (o `BASE_PATH=/MiRepo/ npm run build` si se sirve desde una subcarpeta).

**¡Felicidades!** Tienes un sitio web oficial de grandísima fiabilidad técnica en el aire 🌍.

---

## 📜 Licencia

Este proyecto está liberado bajo licencia libre **[MIT License](LICENSE)**. 
Eres completamente libre de utilizar este código fuente, hacer un *fork*, vender tus desarrollos derivados, o desplegarlo en producción para cuantas academias deportivas, gimnasios o equipos consideres oportuno de manera comercial o altruista.

---

## 🗄️ Migraciones en el proyecto de Supabase actual

El proyecto de producción se creó a mano, antes de versionar el esquema, así que su historial de migraciones está vacío. `20261017000000_baseline.sql` es una copia exacta de lo que ya tiene; no hay que ejecutarla allí, solo marcarla como aplicada una vez:

```bash
npx supabase link --project-ref <TU-ID-SUPABASE>
npx supabase migration repair --status applied 20261017000000
```

A partir de ahí, `npx supabase db push` solo aplica las migraciones nuevas.
