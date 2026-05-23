import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://localhost:8000'
const wsTarget = process.env.VITE_DEV_WS_TARGET ?? apiTarget.replace(/^http/, 'ws')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true
      },
      '/ws': {
        target: wsTarget,
        ws: true,
        changeOrigin: true
      },
    },
  },
})
