import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Pin the dev server origin. localStorage is keyed per origin, so if Vite
  // ever drifted to :5174 (port already in use) you'd silently lose every
  // saved thread, search, and the response cache. strictPort makes it fail
  // loudly instead of moving — surface the conflict rather than strand data.
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
})
