import { defineConfig, type PreviewServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const timestamp = '2026-10-12T00:00:00.000Z';
const snapshot = {
  profile: { id: 'harness-owner', email: 'owner@example.invalid', displayName: 'Harness Owner' },
  posts: [], media: [], libraryItems: [],
  socialAccounts: ['TELEGRAM', 'MAX'].map(provider => ({
    id: `harness-${provider.toLowerCase()}`, userId: 'harness-owner', provider: provider.toLowerCase(),
    displayName: `Fixture ${provider}`, enabled: true, connectionStatus: 'CONNECTED',
    providerAccountId: null, createdAt: timestamp, updatedAt: timestamp,
  })),
};

function fixtureApi(server: PreviewServer | ViteDevServer) {
  server.middlewares.use((request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:4318');
    const pathname = url.pathname;
    if (!pathname.startsWith('/api/')) return next();
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'GET' && pathname === '/api/bootstrap') {
      response.end(JSON.stringify(snapshot));
      return;
    }
    // Dashboard performs read-only summary queries on mount; never refresh metrics.
    if (request.method === 'GET' && pathname === '/api/analytics' &&
        ['telegram', 'max'].includes(url.searchParams.get('provider') ?? '') &&
        url.searchParams.get('period') === '7' && url.searchParams.get('page') === '0') {
      response.end(JSON.stringify({ provider: url.searchParams.get('provider'), period: 7, page: 0,
        pageSize: 20, eligibleCount: 0, observedCount: 0, total: null, totalOverflow: false, rows: [], asOf: timestamp }));
      return;
    }
    response.statusCode = 405;
    response.end('{"error":"Fixture rejects this API operation; no backend is connected"}');
  });
}

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  envDir: false, // Never read .env files, credentials or a real backend URL.
  resolve: { alias: { '@': repo } },
  server: { host: '127.0.0.1', port: 4318, strictPort: true },
  preview: { host: '127.0.0.1', port: 4318, strictPort: true },
  build: { outDir: `${repo}/.sites-runtime/e2e`, emptyOutDir: true },
  plugins: [react(), {
    name: 'planly-isolated-api-fixture',
    configureServer: fixtureApi,
    configurePreviewServer: fixtureApi,
  }],
});
