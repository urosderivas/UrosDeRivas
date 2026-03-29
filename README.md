# 🏀 Plataforma Web Universal para Clubes (Clupik Integration) - Uros de Rivas

Una plataforma frontend de alto rendimiento y estética ultra-premium desarrollada originalmente para el **Club Deportivo Elemental Uros de Rivas**, diseñada desde cero bajo una concepción de Arquitectura Hexagonal y utilizando **React + TypeScript + Vite**.

Este repositorio no solo contiene el ecosistema del club de baloncesto Uros de Rivas, sino que está preparado estructuralmente para servir como **Plantilla Universal (Boilerplate)** Open Source para cualquier otro club deportivo que quiera digitalizar por completo toda su operativa de e-commerce, campuses de verano y visualización de resultados, independientemente de si usa o no la **API de Clupik** 🏆.

## ✨ Capacidades y Nuevas Características Implementadas

El sistema ha evolucionado de un simple visor a una completa **Plataforma de E-Commerce y Gestión de Clubes** integral:

- **E-Commerce y Tienda Nativa:** Sistema de carrito de compras funcional con soporte para variables (tallas, colores) y **campos de texto personalizados** (ej: *Dorsal a imprimir*, *Añadir nombre de Jugador/a*). Todo sincronizado con un backend transaccional.
- **Gestor de Campus e Inscripciones:** Módulo especializado para eventos del club. Soporta:
  - **Descuentos dinámicos:** Precios escalonados (por volumen de días elegidos) y descuentos por cantidad de hermanos/inscritos.
  - Generación de formularios personalizados flexibles.
  - Reservas directas o pagos con verificación online.
- **Integración Nativa de Stripe (Serverless):** Checkout integrado mediante **Supabase Edge Functions** (para procesar pagos de Stripe de forma segura y sin exponer tus CLAVES), con un innovador sistema de sincronización *Webhook-less* manual a demanda de la directiva.
- **Panel de Administración Inteligente (Dashboard):** 
  - Gestión integral de **Pedidos** del club y **Asistentes al Campus**.
  - Interfaz de "Sincronización Stripe" en un click: detecta pagos abandonados y confirmados en tiempo real.
  - 📥 **Importador Clupik Directo:** Permite volcar todo tu catálogo de ropa alojado en Clupik a tu base de datos local pre-calculando variables para independizar tu web.
  - 📊 **Exportador Excel (.xlsx):** Descarga de un clic de todos tus clientes, reservas y finanzas estructuradas.
  - 📄 **Generador de Facturas PDF (Anti-falsificación):** Creación de facturas locales instantáneas (jsPDF) insertando metadatos únicos y códigos QR verificables por directiva para pases de Campus o entregas de ropa en mano.
- **Conector Nativo a la API de Clupik:** Sigue existiendo el motor centralizado para extraer calendarios, partidos en curso y cuadros de clasificación (`standings`) directamente desde los endpoints federativos.
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
   ```bash
   npx supabase db push
   # Recuerda inyectar tu API Key SECRETA de Stripe en Supabase:
   npx supabase secrets set STRIPE_SECRET_KEY=sk_tc_...
   npx supabase functions deploy create-checkout-session --no-verify-jwt
   npx supabase functions deploy verify-payment --no-verify-jwt
   ```

5. **Arranca el Servidor Vite**
   ```bash
   npm run dev
   ```

---

## 🚀 Cómo usar esta plantilla para OTRO Club Deportivo de forma Open Source

La magia de este sistema reside en nuestro adaptador inteligente y su arquitectura acoplable. No necesitas pagar mil herramientas: puedes centralizar las cuotas, el merchandising y tus campus de verano bajo UN ÚNICO entorno sin costes de servidor ni mantenimiento (GitHub Pages + Servidor Supabase Gratuito).

### Paso 1: Configura tu Supabase
Crea un proyecto gratuito en Supabase, vuelca el archivo local `supabase_schema.sql` en tu *SQL Editor* para montar todas las tablas del mercado, usuarios y campus. Configura tus secretos de Stripe.

### Paso 2: Cambia tu ID de Clupik (Opcional)
Si tu equipo deportivo pertenece a la red de Clupik (casi todas las federaciones territoriales lo están integrando):
> En el código (ej. `Clasificaciones.tsx`), el `clubId` del Uros de Rivas es `67`. ¡Cámbialo al de tu club para heredar toda tu cantera, filiales y calendarios de tu territorial automáticamente!

### Paso 3: Identidad Corporativa Custom
Las variables fundamentales están centralizadas en `src/index.css`. Sustituye:
```css
  --primary-color: #d4af37; /* El color principal de tu equipo (ej: Naranja, Rojo) */
  --bg-color: #0c0f12;      /* Fondo, compatible con Dark Mode elegante */
```
*Sube los escudos de tu equipo en `public/assets/*` y cambia las referencias principales en el `Navbar.tsx` y `Home.tsx`.*

### Paso 4: Despliegue Público Gratuito y Automatizado
El código expone unos `scripts` listos para ser publicados estáticamente en GitHub Pages:
1. En `vite.config.ts`, cambia la url `base` a tu Repositorio de GitHub: `base: '/TuRepositorio/'`.
2. Actualiza tu `package.json`: `"homepage": "https://<TU-USUARIO>.github.io/TuRepositorio/"`.
3. Ejecuta el empaque hacia el mundo:
   ```bash
   npm run deploy
   ```

**¡Felicidades!** Tienes un sitio web oficial de grandísima fiabilidad técnica en el aire 🌍.

---

## 📜 Licencia

Este proyecto está liberado bajo licencia libre **[MIT License](LICENSE)**. 
Eres completamente libre de utilizar este código fuente, hacer un *fork*, vender tus desarrollos derivados, o desplegarlo en producción para cuantas academias deportivas, gimnasios o equipos consideres oportuno de manera comercial o altruista.
