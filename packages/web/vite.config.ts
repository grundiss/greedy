import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // Bind-mounted source on macOS/Windows doesn't emit fs events; poll instead.
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
  },
});
