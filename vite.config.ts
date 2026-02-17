import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/serpapi': {
            target: 'https://serpapi.com',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/serpapi/, '/search.json'),
            configure: (proxy, options) => {
              proxy.on('proxyReq', (proxyReq, req, res) => {
                // Add API key to proxied requests
                const url = new URL(req.url || '', `http://${req.headers.host}`);
                url.searchParams.set('api_key', env.VITE_SERP_API_KEY || '');
                proxyReq.path = url.pathname + url.search;
              });
            }
          },
          '/api/jina': {
            target: 'https://r.jina.ai',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/jina/, '')
          }
        }
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
        'process.env.SERP_API_KEY': JSON.stringify(env.VITE_SERP_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
