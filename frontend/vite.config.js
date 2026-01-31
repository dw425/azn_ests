import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://stock-trading-api-fcp5.onrender.com', // Your actual backend URL
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
