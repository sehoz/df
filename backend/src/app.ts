import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { loadConfig } from './config.js';
import { DeltaforceClient } from './deltaforce-client.js';
import { RefreshService } from './refresh-service.js';
import { CosStorageAdapter, LocalStorageAdapter } from './storage.js';

export function createApp() {
  const config = loadConfig();
  const storage = config.storageMode === 'cos'
    ? new CosStorageAdapter()
    : new LocalStorageAdapter(config.localDataDir, config.publicAssetBaseUrl);
  const client = new DeltaforceClient({
    baseUrl: config.apiBaseUrl,
    token: config.apiToken,
  });
  const service = new RefreshService(client, storage, config.refreshCooldownMs);
  const app = new Hono();

  app.use('*', cors());

  app.get('/api/status', async (c) => {
    return c.json({ ok: true, ...(await service.getStatus()) });
  });

  app.get('/api/rankings', async (c) => {
    const data = await service.getRankings();
    if (!data) {
      return c.json({ ok: false, error: 'NO_CACHE' }, 404);
    }
    return c.json({ ok: true, ...data });
  });

  app.post('/api/refresh', async (c) => {
    const result = await service.refresh();
    return c.json({ ok: true, ...result, ...(result.data || {}) });
  });

  app.notFound((c) => c.json({ ok: false, error: 'NOT_FOUND' }, 404));
  app.onError((error, c) => c.json({ ok: false, error: error.message || String(error) }, 500));
  return app;
}
