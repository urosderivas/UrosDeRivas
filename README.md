# Web del Club Deportivo Elemental Uros de Rivas

Web oficial del club de baloncesto Uros de Rivas (Rivas-Vaciamadrid): noticias,
inscripciones a campus, torneos y viajes, tienda oficial y patrocinadores, con un
panel para que el club lo gestione todo sin tocar código.

Publicada en https://urosderivas.github.io/UrosDeRivas/ (hasta que se conecte el
dominio del club).

## Qué tiene la web

- **Inicio**: portada con las últimas noticias con foto, accesos rápidos, una fila
  de productos de la tienda y las noticias del club.
- **Campus** y **Torneos y viajes**: cada evento tiene fechas, cartel, aforo y una
  tabla de precios. Las familias se inscriben con nombre de cada asistente y pagan
  con tarjeta; si el evento es gratis, la inscripción se confirma sin pago.
- **Tienda**: productos con tallas u opciones y campos de texto (dorsal, nombre…),
  carrito y pago con tarjeta (la web no admite pagos en mano).
- **Patrocinadores**: página propia y una cinta con sus logos encima del pie en el
  resto de páginas.
- **Cuenta de usuario**: registro, inicio de sesión (también con Google),
  recuperar contraseña y "Mis pedidos" con el justificante de cada pago.
- **Textos legales**: aviso legal, privacidad y cookies, con los datos del club.

## Lo que gestiona el club desde la web

Con una cuenta de administrador, sin tocar código:

- **Noticias** (en Inicio): crear, editar y borrar. Pueden llevar imagen, enlaces
  en el texto (`[texto](https://...)`) y enlazar a un campus, torneo o viaje.
- **Campus, torneos y viajes** (en su pestaña): crear, editar, ocultar y borrar.
  - Las fechas se añaden por rango ("del 22 al 30") o de una en una.
  - **Tabla de precios**: una fila por número de asistentes y una columna por
    número de días; en cada casilla va el precio **total**. Debajo, lo que se suma
    por cada asistente de más a partir de la última fila. También se puede cobrar
    por evento completo (sin elegir días). Se rellena rápido con "X € por asistente
    y día" o copiando la tabla de otro evento, y se puede comprobar cualquier
    combinación antes de guardar.
- **Patrocinadores**: añadir, editar, ocultar, ordenar y borrar.
- **Panel de estadísticas** (menú ESTADÍSTICAS):
  - Pedidos de la tienda: estado (pendiente, procesando = pagado, completado =
    entregado, cancelado), justificante en PDF y comprobación con Stripe.
  - Inscripciones de cada evento, con su estado y justificante.
  - Productos de la tienda: crear, editar y borrar.
  - Escáner del QR de los justificantes, exportación a Excel, lista de usuarios
    (ver su rol y borrar cuentas) y registro de actividad.

Las imágenes se suben al almacenamiento de Supabase (carpeta pública `media`) o se
pega el enlace de una imagen ya publicada.

## Datos del club y escudo

- Nombre legal, CIF, dirección y email de contacto: `src/config.ts`. Es el único
  sitio que hay que cambiar; los textos legales y los justificantes los leen de ahí.
  **El CIF todavía es de relleno** (`GXXXXXXXXX`).
- Avisos fijos de la barra dorada superior: `PROMO_MESSAGES` en `src/config.ts`.
- Escudo: `public/assets/logo_uros.png` (PNG con fondo transparente). Para cambiarlo
  basta con sustituir el archivo con el mismo nombre. El icono de la pestaña es
  `public/assets/favicon.png`.
- Colores: variables al principio de `src/index.css`.

## Cómo funciona por dentro

| Parte | Servicio | Coste |
|---|---|---|
| Web | GitHub Pages, se publica sola desde GitHub Actions | Gratis |
| Base de datos, usuarios, imágenes y funciones de pago | Supabase (plan gratuito) | Gratis |
| Pagos con tarjeta | Stripe | Solo la comisión de cada pago |

- El código de la web es React + TypeScript + Vite (`src/`).
- El esquema de la base de datos está en `supabase/migrations/`, con seguridad por
  filas (RLS): cada usuario solo ve sus pedidos e inscripciones, y solo admins y
  entrenadores gestionan contenido.
- Los pagos pasan por tres funciones de Supabase (`supabase/functions/`):
  - `create-checkout-session`: valida el pedido o la inscripción, **calcula el
    importe en el servidor** (nunca se fía del navegador) y abre el pago en Stripe.
  - `stripe-webhook`: Stripe avisa de cada pago completado, caducado o fallido y el
    pedido o la inscripción cambian de estado solos.
  - `verify-payment`: comprobación manual desde el panel.
- El precio de los eventos se calcula con `supabase/functions/_shared/pricing.ts`,
  que usan tanto la web (para enseñar el precio) como la función de pago (para
  cobrarlo), así que siempre coinciden.
- El plan gratuito de Supabase pausa el proyecto tras una semana sin actividad.

## Desarrollo en local

```bash
npm install
npm run dev
```

Hace falta un archivo `.env` en la raíz con las claves públicas del proyecto de
Supabase:

```env
VITE_SUPABASE_URL=https://<id-del-proyecto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_...
```

Para compilar como en producción: `npm run build` (o `BASE_PATH=/UrosDeRivas/ npm run build`
si se sirve desde una subcarpeta).

## Base de datos y funciones de pago

Cualquier cambio en la base de datos se hace con una migración nueva
(`npx supabase migration new <nombre>`), nunca a mano en el panel de Supabase.

```bash
npx supabase link --project-ref <id-del-proyecto>
npx supabase db push

# Secretos de las funciones (se ponen una vez; nunca van en el código)
npx supabase secrets set STRIPE_SECRET_KEY=sk_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
# Webs a las que Stripe puede volver tras el pago, separadas por comas
npx supabase secrets set ALLOWED_ORIGINS=https://urosderivas.github.io,http://localhost:5173

npx supabase functions deploy create-checkout-session --no-verify-jwt
npx supabase functions deploy verify-payment --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

Las funciones se despliegan sin verificación JWT de Supabase porque comprueban el
usuario ellas mismas (y el webhook, la firma de Stripe).

**Webhook de Stripe**: en Stripe → Developers → Webhooks, endpoint
`https://<id-del-proyecto>.supabase.co/functions/v1/stripe-webhook` con los eventos
`checkout.session.completed`, `checkout.session.expired`,
`checkout.session.async_payment_succeeded` y `checkout.session.async_payment_failed`.
Su *signing secret* es el `STRIPE_WEBHOOK_SECRET`.

El proyecto de producción se creó antes de versionar el esquema:
`20261017000000_baseline.sql` es una copia de lo que ya tenía y está marcada como
aplicada, así que `npx supabase db push` solo aplica las migraciones nuevas.

## Publicación

La web se publica sola en GitHub Pages con cada cambio en la rama `master`
(`.github/workflows/deploy.yml`); en los pull requests solo se compila para avisar
si algo se ha roto.

- Variables del repositorio (Settings → Secrets and variables → Actions →
  Variables): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` y, con
  dominio propio, `CUSTOM_DOMAIN` (por ejemplo `www.urosderivas.com`).
- Con dominio propio hay que apuntar el DNS a GitHub Pages
  ([guía](https://docs.github.com/es/pages/configuring-a-custom-domain-for-your-github-pages-site))
  y añadir la nueva dirección en Supabase (Authentication → URL Configuration), en
  el secreto `ALLOWED_ORIGINS` y en el cliente de Google del inicio de sesión.

## Licencia

Código propiedad de sus autores y del club, todos los derechos reservados: ver
[LICENSE](LICENSE). El club puede usarlo y modificarlo para su web; nadie más
puede reutilizarlo sin permiso.
