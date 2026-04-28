import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router'],
          'element-plus': ['element-plus'],
          'element-icons': ['@element-plus/icons-vue'],
          'leaflet': ['leaflet'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api/gitee': {
        target: 'https://gitee.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gitee/, ''),
      },
    },
  },
})
