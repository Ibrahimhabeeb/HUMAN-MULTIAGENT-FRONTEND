import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Requests to /api go to the backend (uv run python main.py), so the browser only talks to one origin.
const proxy = {
  '/api': {
    target: process.env.API_URL ?? 'http://127.0.0.1:8000',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
}

// Port 5001 so this can run side by side with the reference build on 5000.
export default defineConfig({
  plugins: [react()],
  server: { port: 5001, strictPort: true, proxy },
  preview: { port: 5001, strictPort: true, proxy },
  worker: { format: 'es' },
})
