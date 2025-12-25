import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  worker: {
    format: 'es', // ✅ module worker（必须）
  },

  build: {
    target: 'es2020',
  },

  esbuild: {
    target: 'es2020',
  },

  optimizeDeps: {
    exclude: ['three'], 
    // 避免 Three 在 dev 下被重复预构建（r182 更稳）
  },
});
