import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],
  // Use root path for custom domain
  base: '/',
  server: {
    port: 8081,
    host: true, // Listen on all addresses
    allowedHosts:['peppertrees.asuscomm.com'],
  },
  
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
