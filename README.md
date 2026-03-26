# 🏀 Plataforma Web Universal para Clubes (Clupik Integration) - Uros de Rivas

Una plataforma frontend de alto rendimiento y estética ultra-premium desarrollada originalmente para el **Club Deportivo Elemental Uros de Rivas**, diseñada desde cero bajo una concepción de Arquitectura Hexagonal y utilizando Vite + React + TypeScript.

Este repositorio no solo contiene el ecosistema del club de baloncesto Uros de Rivas, sino que está preparado estructuralmente para servir como **Plantilla Universal (Boilerplate)** para cualquier otro club deportivo cuyas competiciones y calendarios estén federados y registrados a través del ecosistema de la **API de Clupik**.

## ✨ Características Principales

- **Arquitectura Hexagonal:** Código altamente desacoplado entre adaptadores de infraestructura (`/src/infrastructure/`), lógica de dominio (`/src/domain/`) y presentación (`/src/presentation/`).
- **Integración Nativa a la API Clupik:** Motor centralizado para extraer calendarios, partidos en curso, históricos, estadísticas paramétricas de juego ("A Favor", "En Contra") y cuadros de clasificación (`standings`) directamente desde los endpoints federativos.
- **Filtros Dinámicos Globales:** Un buscador tipo *Combobox* autocompletable que permite diseccionar toda la información deportiva por competiciones globales y navegar en "cascada" por el árbol de competiciones y redes de clubes inscritos sin sacrificar la interfaz principal de tu club base.
- **Base de Datos Back-end Opcional:** Configuración lista para usarse con **Supabase** para administrar bases de datos transaccionales satélites, sistema de login y roles de Administrador. (Ideal para implementar la Tienda de *Merchandising* o las reservas de *Eventos* no nativos de Clupik).
- **Despliegue Cero-Fricciones con GitHub Pages:** Preparado para compilarse y publicarse de manera gratuita y eficiente desde el ecosistema `gh-pages` con *Client-Side Routing* estabilizado dinámicamente.
- **Stripe Edge E-Commerce**: Seamlessly integrated Serverless checkout sessions via Supabase Edge Functions linking physical team merchandising straight to an unhackable Order tracker.
- **Deep Dashboard**: Comprehensive Admin Panel allowing club management to trace page routing telemetry seamlessly, intercept physical Stripe orders, and edit Market Catalogs.

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
   Crea un archivo llamado `.env.local` en la carpeta raíz copiando el diseño del módulo Supabase, e introduce tus credenciales (estos datos solo son necesarios si harás uso de apartados como `Mercado` o `Eventos Privados`):
   ```env
   VITE_SUPABASE_URL=https://<TU-ID>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<TU-API-KEY-PUBLICA>
   ```

4. **Arranca el Servidor Vite**
   ```bash
   npm run dev
   ```

---

## 🚀 Cómo usar esta plantilla para OTRO Club Deportivo

La magia de este sistema reside en nuestro adaptador inteligente a la red Clupik. Si tu equipo deportivo actual pertenece a la red de Clupik (casi todas las federaciones territoriales lo están integrando), bastará con modificar una única variante y adaptar la paleta de colores.

### Paso 1: Fija el Club Id (`clubId`) de tu organización
El núcleo estructural se define en el módulo gestor global. Si inspeccionas la ruta de las URLs de llamadas a Clupik, podrás registrar tu ID de Club identificador principal. Todas las tracciones, equipos cantera de tu directiva y torneos se alinearán a ese dígito paramétrico automáticamente.

> (Ejemplo: En el Uros de Rivas, el `clubId` universal que absorbe en sus queries es `67`. Cambia este valor por el de tu club en las queries nativas de Clupik de `src/presentation/Clasificaciones.tsx`).

### Paso 2: Cambia los Logos y Estilos
Las variables fundamentales están centralizadas en `src/index.css`.
Actualmente el diseño está concebido para Uros de Rivas (Negro `#000`/ Dorado `#d4af37` / Turquesa).

Abre el archivo `index.css` y modifica las variables del sistema de diseño (CSS Custom Properties). Ejemplos:
```css
  --primary-color: #d4af37; /* Reemplazar por tu color corporativo */
  --bg-color: #0c0f12;      /* Color de fondo para arquitectura Dark Mode */
```
A continuación, dirígete a la carpeta `public/assets/` y sustituye los logotipos principales (`navbar_black_bull.png`, *Wallpapers* promocionales de la portada) asegurándote de utilizar los mismos nombres base, o actualizar las rutas del componente `Navbar.tsx` y `Home.tsx`.

### Paso 3: Despliegue Público Gratuito
El código expone unos `scripts` listos para ser publicados estáticamente. 

1. Ve al archivo base de `vite.config.ts`, y cambia tu `base` url a la que conformará tu repositorio:
   ```ts
   export default defineConfig({
     base: '/NombreDeTuRepo/',
   })
   ```
2. Asegúrate también de apuntar el archivo global `package.json` en su atractor de origen:
   ```json
   "homepage": "https://<TU-USUARIO-GITHUB>.github.io/NombreDeTuRepo/",
   ```
3. Ejecuta el empaque logístico:
   ```bash
   npm run deploy
   ```

Teniendo esto completado, GitHub Pages habilitará gratuitamente y blindado SSL todo tu entorno para tu liga de baloncesto.

---

## 📜 Licencia

Este proyecto está liberado bajo licencia libre **[MIT License](LICENSE)**. 
Eres completamente libre de utilizar este código fuente, hacer un *fork*, vender tus desarrollos derivados, o desplegarlo en producción para cuantas academias deportivas o equipos consideres oportuno de manera comercial o altruista.
