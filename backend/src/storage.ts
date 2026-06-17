import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as cloudbase from '@cloudbase/node-sdk';

export interface ObjectStorage {
  readJson<T>(key: string): Promise<T | null>;
  writeJson<T>(key: string, value: T): Promise<void>;
  writeBytes(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
}

export class LocalStorageAdapter implements ObjectStorage {
  constructor(private readonly rootDir: string, private readonly publicAssetBaseUrl = '') {}

  private filePath(key: string): string {
    return path.join(this.rootDir, key);
  }

  async readJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await readFile(this.filePath(key), 'utf8');
      return JSON.parse(raw) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async writeJson<T>(key: string, value: T): Promise<void> {
    const target = this.filePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  async writeBytes(key: string, bytes: Uint8Array): Promise<string> {
    const target = this.filePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    const normalized = key.replaceAll('\\', '/');
    return this.publicAssetBaseUrl ? `${this.publicAssetBaseUrl.replace(/\/$/, '')}/${normalized}` : `/${normalized}`;
  }
}

interface CacheDoc<T> {
  _id: string;
  key: string;
  value: T;
  updatedAt: number;
}

export class CloudBaseStorageAdapter implements ObjectStorage {
  private readonly app = cloudbase.init({
    env: process.env.TCB_ENV_ID || process.env.SCF_NAMESPACE,
  });
  private readonly db = this.app.database();
  private readonly collectionName = process.env.TCB_CACHE_COLLECTION || 'df_cache';

  async readJson<T>(key: string): Promise<T | null> {
    try {
      const result = await this.db.collection(this.collectionName).where({ key }).limit(1).get();
      const data = result.data as CacheDoc<T>[] | CacheDoc<T> | undefined;
      const doc = Array.isArray(data) ? data[0] : data;
      return doc?.value ?? null;
    } catch (error) {
      const message = String((error as Error).message || error);
      if (message.includes('document does not exist') || message.includes('does not exist')) return null;
      throw error;
    }
  }

  async writeJson<T>(key: string, value: T): Promise<void> {
    const doc = {
      key,
      value,
      updatedAt: Date.now(),
    };
    const collection = this.db.collection(this.collectionName);
    const existing = await collection.where({ key }).limit(1).get();
    const data = existing.data as Array<{ _id?: string }> | undefined;
    const id = Array.isArray(data) ? data[0]?._id : undefined;
    if (id) {
      await collection.doc(id).update(doc);
    } else {
      await collection.add(doc);
    }
  }

  async writeBytes(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const cloudPath = key.replaceAll('\\', '/');
    void contentType;
    const upload = await this.app.uploadFile({
      cloudPath,
      fileContent: Buffer.from(bytes),
    });
    const fileID = upload.fileID;
    const urls = await this.app.getTempFileURL({ fileList: [fileID] });
    return urls.fileList?.[0]?.tempFileURL || fileID;
  }
}


