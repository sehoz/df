import { normalizeManufactureRow, type ManufactureRow, type StationId } from './core';

export interface DeltaforceClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

export class DeltaforceClient {
  constructor(private readonly options: DeltaforceClientOptions) {}

  private buildUrl(pathname: string, params: Record<string, string | number> = {}): URL {
    const base = this.options.baseUrl.endsWith('/') ? this.options.baseUrl : `${this.options.baseUrl}/`;
    const url = new URL(pathname.replace(/^\/+/, ''), base);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    if (this.options.token) {
      url.searchParams.set('token', this.options.token);
    }
    return url;
  }

  async fetchJson(pathname: string, params: Record<string, string | number> = {}): Promise<unknown> {
    if (!this.options.token) {
      throw new Error('DF_API_TOKEN is not configured');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15000);
    try {
      const response = await fetch(this.buildUrl(pathname, params), {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'DeltaForceRanker/2.0',
        },
        signal: controller.signal,
      });
      const text = await response.text();
      const data = JSON.parse(text);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      if (data && typeof data === 'object' && 'code' in data && data.code !== 0) {
        throw new Error(data.msg || data.message || `API error ${data.code}`);
      }
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async loadManufactureStation(station: StationId, level = 3): Promise<ManufactureRow[]> {
    const result = await this.fetchJson('/v1/sjz_api/manufacturePro', { t: station, l: level });
    const list = Array.isArray((result as { data?: unknown[] })?.data) ? (result as { data: unknown[] }).data : [];
    return list.map((raw) => normalizeManufactureRow(raw, { station, level }));
  }

  async loadItemInfoAll(): Promise<unknown[]> {
    const result = await this.fetchJson('/v1/sjz_api/item_info_all');
    return Array.isArray((result as { data?: unknown[] })?.data) ? (result as { data: unknown[] }).data : [];
  }
}

