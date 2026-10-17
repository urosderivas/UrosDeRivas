import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ruta desde la que se sirve la web. Con dominio propio es '/'; en
  // usuario.github.io/UrosDeRivas/ es '/UrosDeRivas/'. La fija el workflow de despliegue.
  base: process.env.BASE_PATH || '/',
})
