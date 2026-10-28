# Web del Club Deportivo Elemental Uros de Rivas

Web oficial del club de baloncesto Uros de Rivas (Rivas-Vaciamadrid): noticias,
inscripciones a campus, torneos y viajes, tienda oficial y patrocinadores, con un
panel para que el club lo gestione todo sin tocar código.

Publicada en https://urosderivas.github.io/UrosDeRivas/ (hasta que se conecte el
dominio del club).

## Qué tiene la web

- **Inicio**: portada con las 4 últimas noticias, accesos rápidos, una fila de
  productos de la tienda y las noticias del club.
- **Campus** y **Torneos y viajes**: cada evento tiene fechas, cartel, aforo y una
  tabla de precios. Las familias se inscriben con el nombre y los días de cada
  asistente y pagan por transferencia; si el evento es gratis, la inscripción se
  confirma sin pago.
- **Tienda**: productos con tallas u opciones y campos de texto (dorsal, nombre…),
  carrito y pago por transferencia.
- **Citas** de fisioterapia y recuperación, gratis o de pago (por transferencia).
- **Pago por transferencia**: al comprar, inscribirse o reservar una cita de pago,
  la web enseña el IBAN del club, el importe y un concepto único (`UROS-XXXXXX`) y
  manda lo mismo por email. Queda "pendiente de pago" (guardando la plaza o la hora)
  hasta que el club lo marca como pagado en el panel.
- **Patrocinadores**: página propia y una cinta con sus logos encima del pie en el
  resto de páginas.
- **Cuenta de usuario**: registro, inicio de sesión (también con Google) y
  recuperar contraseña. En **Mi cuenta** (icono de persona arriba) cada uno pone su
  nombre, apellidos y teléfono, ve "Mis pedidos" con el justificante de cada pago y,
  en lo pendiente, los datos para hacer la transferencia. Antes de la primera compra, inscripción o cita se le
  piden el nombre y el teléfono si faltan.
- **Textos legales**: aviso legal, privacidad y cookies, con los datos del club.

## Lo que gestiona el club desde la web

Con una cuenta de administrador, sin tocar código:

- **Noticias** (en Inicio): crear, editar, ocultar y borrar. Pueden llevar imagen,
  enlaces en el texto (`[texto](https://...)`) y enlazar a un campus, torneo o viaje.
- **Campus, torneos y viajes** (en su pestaña): crear, editar, ocultar y borrar.
  - Las fechas se añaden por rango ("del 22 al 30") o de una en una.
  - **Tabla de precios**: una fila por número de asistentes y una columna por
    número de días; en cada casilla va el precio **total**. Debajo, lo que se suma
    por cada asistente de más a partir de la última fila. También se puede cobrar
    por evento completo (sin elegir días). Se rellena rápido con "X € por asistente
    y día" o copiando la tabla de otro evento, y se puede comprobar cualquier
    combinación antes de guardar.
  - Cada asistente elige sus días. Todos pagan la casilla de los días del que
    menos va, y cada uno que va más días paga sus días de más como 1 asistente
    (4 asistentes de 4, 4, 5 y 6 días = casilla 4 asist. 4 días + casilla 1 asist.
    1 día + casilla 1 asist. 2 días).
- **Patrocinadores**: añadir, editar, ocultar, ordenar y borrar.
- **Panel de estadísticas** (menú ESTADÍSTICAS):
  - **Datos de pago**: IBAN, titular, plazo para pagar (3 días por defecto) y una nota que salen al comprar y en el email. Lo que no se pague en plazo se cancela a mano.
  - Pedidos de la tienda: estado (pendiente de pago, pagado y por entregar,
    entregado, cancelado), botón "Marcar pagado" y justificante en PDF.
  - Inscripciones de cada evento, con su estado, "Marcar pagada" y justificante.
  - Citas: cada calendario marca sus citas como pagadas cuando llega la transferencia.
  - Productos de la tienda: crear, editar y borrar.
  - Escáner del QR de los justificantes, exportación a Excel (con el nombre y el
    teléfono de cada cuenta), lista de usuarios (sus datos con el icono ⓘ, su rol y
    borrar cuentas) y registro de actividad.
  - Pendiente: que cada usuario borre su propia cuenta desde Mi cuenta. El código ya
    está; para activarlo se aplica en Supabase
    `supabase/pendiente/20261028120001_keep_records_on_account_delete.sql` y se pone
    `accountDeletion: true` en `src/config.ts`.

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
| Base de datos, usuarios, imágenes y funciones | Supabase (plan gratuito) | Gratis |
| Emails con los datos de la transferencia | Un buzón del club en Arsys | Incluido en el hosting |

- El código de la web es React + TypeScript + Vite (`src/`).
- El esquema de la base de datos está en `supabase/migrations/`, con seguridad por
  filas (RLS): cada usuario solo ve sus pedidos e inscripciones, y solo admins y
  entrenadores gestionan contenido.
- Compras, inscripciones y citas de pago pasan por la función de Supabase
  `create-checkout-session` (`supabase/functions/`): valida el pedido o la
  inscripción, **calcula el importe en el servidor** (nunca se fía del navegador),
  lo guarda pendiente con su concepto (`UROS-...`, en la columna `stripe_session_id`,
  que antes guardaba la sesión de Stripe) y manda el email (`_shared/mail.ts`).
  Hasta octubre de 2026 se pagaba con tarjeta (Stripe); los registros de entonces
  tienen una sesión `cs_...`.
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

# Buzón desde el que salen los emails (se pone una vez; nunca va en el código).
# También se puede poner en Supabase → Edge Functions → Secrets.
npx supabase secrets set SMTP_USER=administracion@urosderivas.com SMTP_PASS=...

npx supabase functions deploy create-checkout-session --no-verify-jwt
```

La función se despliega sin verificación JWT de Supabase porque comprueba el
usuario ella misma. Sin `SMTP_USER` y `SMTP_PASS` funciona igual, pero no manda
emails (la web enseña los mismos datos). El servidor de correo es el de Arsys
(`smtp.serviciodecorreo.es`, puerto 465); se puede cambiar con `SMTP_HOST` y
`SMTP_PORT` (Supabase no deja usar los puertos 25 ni 587).

Los emails de la cuenta (confirmar el email al registrarse y recuperar la
contraseña) los manda Supabase con el mismo buzón: Authentication → Emails →
SMTP Settings (servidor y usuario de arriba). Su diseño está en
`supabase/templates/` (`confirmation.html` y `recovery.html`): se pega el HTML en
Authentication → Emails → Templates, en "Confirm signup" y "Reset password", con
los asuntos "Confirma tu email - Uros de Rivas" y "Cambia tu contraseña - Uros de
Rivas". El email de la transferencia (`_shared/mail.ts`) usa el mismo diseño; el
escudo va dentro del email (`_shared/email-logo.ts`, copia de
`public/assets/email-logo.png`).

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
