import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';

/**
 * Runs the Vercel functions in /api inside the Vite dev server, so accounts
 * and saving work with plain `npm run dev`. In production Vercel serves them.
 */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', async (req: IncomingMessage & { originalUrl?: string }, res: ServerResponse, next: () => void) => {
        const name = (req.url ?? '/').split('?')[0].replace(/^\/+|\/+$/g, '');
        const file = `api/${name}.ts`;
        if (!/^[a-z-]+$/.test(name) || !existsSync(file)) return next();
        try {
          const mod = await server.ssrLoadModule(`/${file}`);
          const handler = mod[req.method ?? 'GET'] as ((r: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
          const request = new Request(`http://${req.headers.host}${req.originalUrl ?? req.url}`, {
            method: req.method,
            headers,
            body: hasBody ? Buffer.concat(chunks) : undefined,
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error(err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Dev API error' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Server-only secrets (DATABASE_URL, NEON_AUTH_BASE_URL) for the dev API.
  // Only VITE_* variables ever reach the browser bundle.
  const env = loadEnv(mode, 'env', '');
  for (const [k, v] of Object.entries(env)) if (!k.startsWith('VITE_') && process.env[k] === undefined) process.env[k] = v;

  return {
    // Environment variables (Neon keys etc.) live in the env/ folder.
    envDir: 'env',
    server: { host: true, open: true },
    plugins: [devApi()],
    build: {
      // Three.js is one ~600 kB library chunk, cached long-term; nothing to split further.
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          // Three.js in its own cacheable chunk; the tracking library and auth SDK load on demand.
          manualChunks(id: string) {
            if (id.includes('node_modules/three')) return 'three';
            if (id.includes('@neondatabase')) return 'auth';
          },
        },
      },
    },
  };
});
