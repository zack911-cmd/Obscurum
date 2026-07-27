import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // ← this is critical for Electron
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
            return 'vendor-react'
          }
          if (id.includes('@xyflow/react') || id.includes('reactflow')) {
            return 'vendor-flow'
          }
          if (id.includes('lucide-react')) {
            return 'vendor-icons'
          }
          return 'vendor'
        },
      },
    },
  },
})
