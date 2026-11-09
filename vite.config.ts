import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Khi chạy ở máy, /api được chuyển sang server Express (npm run dev:api)
  server: { proxy: { '/api': { target: `http://localhost:${process.env.API_PORT || 3001}`, xfwd: true } } },
});
