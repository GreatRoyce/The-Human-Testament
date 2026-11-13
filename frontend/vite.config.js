import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { cwd } from 'node:process'
import { validateProductionEnv } from './config/production-env.mjs'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') validateProductionEnv(loadEnv(mode, cwd(), 'VITE_'))
  return {
    plugins: [react()],
    // Account origins and emailed links use this exact local address.
    // Refuse a busy port rather than silently moving the frontend to another origin.
    server: { host: 'localhost', port: 5173, strictPort: true },
  }
})
