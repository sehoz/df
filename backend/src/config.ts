export interface ApiConfig {
  apiBaseUrl: string;
  apiToken: string;
  refreshCooldownMs: number;
  storageMode: 'local' | 'cloudbase';
  localDataDir: string;
  publicAssetBaseUrl: string;
}

export function loadConfig(): ApiConfig {
  return {
    apiBaseUrl: process.env.DF_API_BASE_URL || 'https://orzice.com/workApi',
    apiToken: process.env.DF_API_TOKEN || '',
    refreshCooldownMs: Number(process.env.REFRESH_COOLDOWN_MS || 10 * 60 * 1000),
    storageMode: process.env.STORAGE_MODE === 'cloudbase' ? 'cloudbase' : 'local',
    localDataDir: process.env.LOCAL_DATA_DIR || 'data/serverless-cache',
    publicAssetBaseUrl: process.env.PUBLIC_ASSET_BASE_URL || '',
  };
}
