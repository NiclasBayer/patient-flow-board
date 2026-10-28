import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend-only build for GitHub Pages. The workflow sets VITE_BASE_PATH to /<repo>/.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: { port: 8080 },
});
