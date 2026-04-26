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
