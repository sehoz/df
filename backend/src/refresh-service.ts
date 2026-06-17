import {
  normalizeIconUrl,
  normalizeQuality,
  sortRows,
  stationName,
  summarizeRows,
  type ManufactureRow,
  type QualityKey,
  type StationId,
} from './core';
import type { DeltaforceClient } from './deltaforce-client';
import type { ObjectStorage } from './storage';

export interface RankingsCache {
  updatedAt: number;
  rows: ManufactureRow[];
  stats: ReturnType<typeof summarizeRows>;
  errors: string[];
  source: {
    manufactureCount: number;
    stationCount: number;
    assetCount: number;
  };
}

export interface RefreshLock {
  updatedAt: number;
  refreshing: boolean;
  lastRefreshStartedAt?: number;
  lastRefreshFinishedAt?: number;
}

interface ItemAsset {
  iconUrl: string;
  qualityKey: QualityKey;
  localIconUrl?: string;
}

interface ItemAssetCache {
  updatedAt: number;
  catalogScanned: boolean;
  assets: Record<string, ItemAsset>;
}

const RANKINGS_KEY = 'cache/manufacture-latest.json';
const LOCK_KEY = 'cache/refresh-lock.json';
const ASSETS_KEY = 'cache/item-assets.json';
const STATIONS: StationId[] = [1, 2, 3, 4];

function itemKeys(value: Record<string, unknown>): string[] {
  return [
    value.oid,
    value.objectID,
    value.objectId,
    value.id,
    value.tid,
    value.name,
    value.objectName,
    value.itemName,
  ]
    .filter((item) => item !== undefined && item !== null && item !== '')
    .map((item) => String(item).trim().toLowerCase());
}

function extractIconFromItem(item: Record<string, unknown>): string {
  return normalizeIconUrl(
    item.icon
      ?? item.iconUrl
      ?? item.icon_url
      ?? item.image
      ?? item.imageUrl
      ?? item.image_url
      ?? item.pic
      ?? item.picUrl
      ?? item.pic_url
      ?? item.picture
      ?? item.pictureUrl
      ?? item.picture_url
      ?? item.objectIcon
      ?? item.objectIconUrl
      ?? item.objectPic
      ?? item.objectPicUrl
      ?? item.objectImage
      ?? item.objectImageUrl
      ?? item.avatar
      ?? item.logo,
  );
}

function extractQualityFromItem(item: Record<string, unknown>): QualityKey {
  return normalizeQuality(
    item.quality
      ?? item.qualityName
      ?? item.quality_name
      ?? item.rarity
      ?? item.rarityName
      ?? item.rarity_name
      ?? item.grade
      ?? item.gradeName
      ?? item.grade_name
      ?? item.level
      ?? item.levelName
      ?? item.level_name
      ?? item.color
      ?? item.colorName
      ?? item.color_name,
  );
}

function cacheAssetFor(cache: ItemAssetCache, item: Record<string, unknown>, asset: Partial<ItemAsset>): void {
  const iconUrl = asset.iconUrl || '';
  const qualityKey = normalizeQuality(asset.qualityKey || '');
  if (!iconUrl && !qualityKey) return;
  for (const key of itemKeys(item)) {
    const current = cache.assets[key] || { iconUrl: '', qualityKey: '' };
    cache.assets[key] = {
      iconUrl: iconUrl || current.iconUrl || '',
      qualityKey: qualityKey || current.qualityKey || '',
      localIconUrl: asset.localIconUrl || current.localIconUrl,
    };
  }
}

function lookupAsset(cache: ItemAssetCache, row: ManufactureRow): ItemAsset | undefined {
  for (const key of itemKeys(row as unknown as Record<string, unknown>)) {
    const asset = cache.assets[key];
    if (asset?.iconUrl || asset?.localIconUrl || asset?.qualityKey) {
      return asset;
    }
  }
  return undefined;
}

async function loadAssetCache(storage: ObjectStorage): Promise<ItemAssetCache> {
  return (await storage.readJson<ItemAssetCache>(ASSETS_KEY)) || {
    updatedAt: 0,
    catalogScanned: false,
    assets: {},
  };
}

async function downloadIcon(storage: ObjectStorage, row: ManufactureRow, iconUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(iconUrl);
    if (!response.ok) return undefined;
    const contentType = response.headers.get('content-type') || 'image/png';
    const extension = contentType.includes('webp') ? 'webp' : contentType.includes('jpeg') ? 'jpg' : 'png';
    const safeId = String(row.oid || row.objectID || row.name || row.key).replace(/[^\w.-]+/g, '_');
    const bytes = new Uint8Array(await response.arrayBuffer());
    return storage.writeBytes(`assets/items/${safeId}.${extension}`, bytes, contentType);
  } catch {
    return undefined;
  }
}

async function hydrateAssets(rows: ManufactureRow[], client: DeltaforceClient, storage: ObjectStorage): Promise<ItemAssetCache> {
  const cache = await loadAssetCache(storage);
  for (const row of rows) {
    const asset = lookupAsset(cache, row);
    row.iconUrl = asset?.localIconUrl || asset?.iconUrl || row.iconUrl || '';
    row.qualityKey = row.qualityKey || asset?.qualityKey || '';
    cacheAssetFor(cache, row as unknown as Record<string, unknown>, {
      iconUrl: row.iconUrl,
      qualityKey: row.qualityKey,
      localIconUrl: asset?.localIconUrl,
    });
  }

  if (!cache.catalogScanned && rows.some((row) => !row.iconUrl || !row.qualityKey)) {
    const items = await client.loadItemInfoAll();
    for (const itemValue of items) {
      const item = itemValue as Record<string, unknown>;
      cacheAssetFor(cache, item, {
        iconUrl: extractIconFromItem(item),
        qualityKey: extractQualityFromItem(item),
      });
    }
    cache.catalogScanned = true;
  }

  for (const row of rows) {
    const asset = lookupAsset(cache, row);
    row.qualityKey = row.qualityKey || asset?.qualityKey || '';
    const remoteIcon = row.iconUrl || asset?.iconUrl || '';
    const localIcon = asset?.localIconUrl || (remoteIcon ? await downloadIcon(storage, row, remoteIcon) : undefined);
    row.iconUrl = localIcon || remoteIcon;
    cacheAssetFor(cache, row as unknown as Record<string, unknown>, {
      iconUrl: remoteIcon,
      qualityKey: row.qualityKey,
      localIconUrl: localIcon,
    });
  }

  cache.updatedAt = Date.now();
  await storage.writeJson(ASSETS_KEY, cache);
  return cache;
}

export class RefreshService {
  constructor(
    private readonly client: DeltaforceClient,
    private readonly storage: ObjectStorage,
    private readonly cooldownMs: number,
  ) {}

  async getRankings(): Promise<RankingsCache | null> {
    return this.storage.readJson<RankingsCache>(RANKINGS_KEY);
  }

  async getStatus(): Promise<{ updatedAt: number; refreshing: boolean; total: number }> {
    const [rankings, lock] = await Promise.all([
      this.getRankings(),
      this.storage.readJson<RefreshLock>(LOCK_KEY),
    ]);
    return {
      updatedAt: rankings?.updatedAt || 0,
      refreshing: Boolean(lock?.refreshing),
      total: rankings?.rows.length || 0,
    };
  }

  async refresh(): Promise<{ refreshed: boolean; coolingDown: boolean; refreshing: boolean; data: RankingsCache | null }> {
    const now = Date.now();
    const lock = await this.storage.readJson<RefreshLock>(LOCK_KEY);
    const existing = await this.getRankings();
    if (lock?.refreshing) {
      return { refreshed: false, coolingDown: false, refreshing: true, data: existing };
    }
    if (existing && lock?.lastRefreshFinishedAt && now - lock.lastRefreshFinishedAt < this.cooldownMs) {
      return { refreshed: false, coolingDown: true, refreshing: false, data: existing };
    }

    await this.storage.writeJson<RefreshLock>(LOCK_KEY, {
      updatedAt: now,
      refreshing: true,
      lastRefreshStartedAt: now,
      lastRefreshFinishedAt: lock?.lastRefreshFinishedAt,
    });

    try {
      const settled = await Promise.allSettled(
        STATIONS.map(async (station) => {
          const rows = await this.client.loadManufactureStation(station, 3);
          return rows.map((row) => ({ ...row, stationLabel: stationName(station) }));
        }),
      );
      const rows: ManufactureRow[] = [];
      const errors: string[] = [];
      for (const item of settled) {
        if (item.status === 'fulfilled') rows.push(...item.value);
        else errors.push(item.reason?.message || String(item.reason));
      }
      if (rows.length === 0) {
        throw new Error(errors.join('; ') || 'No manufacture data returned');
      }
      const assets = await loadAssetCache(this.storage).catch(() => ({
        updatedAt: 0,
        catalogScanned: false,
        assets: {},
      } as ItemAssetCache));
      for (const row of rows) {
        const asset = lookupAsset(assets, row);
        row.iconUrl = asset?.localIconUrl || asset?.iconUrl || row.iconUrl || '';
        row.qualityKey = row.qualityKey || asset?.qualityKey || '';
      }
      const sorted = sortRows(rows, 'hourly_desc').map((row) => ({ ...row, updatedAt: now }));
      const data: RankingsCache = {
        updatedAt: now,
        rows: sorted,
        stats: summarizeRows(sorted),
        errors,
        source: {
          manufactureCount: sorted.length,
          stationCount: STATIONS.length,
          assetCount: Object.keys(assets.assets).length,
        },
      };
      await this.storage.writeJson(RANKINGS_KEY, data);
      await this.storage.writeJson<RefreshLock>(LOCK_KEY, {
        updatedAt: Date.now(),
        refreshing: false,
        lastRefreshStartedAt: now,
        lastRefreshFinishedAt: Date.now(),
      });
      return { refreshed: true, coolingDown: false, refreshing: false, data };
    } catch (error) {
      await this.storage.writeJson<RefreshLock>(LOCK_KEY, {
        updatedAt: Date.now(),
        refreshing: false,
        lastRefreshStartedAt: now,
        lastRefreshFinishedAt: lock?.lastRefreshFinishedAt,
      });
      if (existing) return { refreshed: false, coolingDown: false, refreshing: false, data: existing };
      throw error;
    }
  }
}

