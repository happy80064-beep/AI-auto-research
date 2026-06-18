import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    root: '.',
    build: {
      outDir: 'dist',
      sourcemap: true,
      chunkSizeWarningLimit: 300,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            charts: ['recharts'],
            firebase: ['firebase/app', 'firebase/firestore', 'firebase/functions', 'firebase/analytics'],
          },
        },
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY)
    }
  };
});
