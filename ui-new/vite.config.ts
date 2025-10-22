import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Use subpath for production build (GitHub Pages), root path for dev server
  base: command === 'build' ? '/lambdallmproxy/' : '/',
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
