import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Cross-origin isolation: needed later for the Python runner (input() and Stop).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// Port 5001 so this can run side by side with the reference build on 5000.
export default defineConfig({
  plugins: [react()],
  server: { port: 5001, strictPort: true, headers: isolationHeaders },
  preview: { port: 5001, strictPort: true, headers: isolationHeaders },
  worker: { format: 'es' },
})
