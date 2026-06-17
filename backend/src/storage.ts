import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import COS from 'cos-nodejs-sdk-v5';

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

export class CosStorageAdapter implements ObjectStorage {
  private readonly cos: COS;
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicBaseUrl: string;

  constructor() {
    const SecretId = process.env.TENCENT_SECRET_ID || '';
    const SecretKey = process.env.TENCENT_SECRET_KEY || '';
    this.bucket = process.env.COS_BUCKET || '';
    this.region = process.env.COS_REGION || '';
    this.publicBaseUrl = process.env.COS_PUBLIC_BASE_URL || '';
    if (!SecretId || !SecretKey || !this.bucket || !this.region) {
      throw new Error('COS storage requires TENCENT_SECRET_ID, TENCENT_SECRET_KEY, COS_BUCKET and COS_REGION');
    }
    this.cos = new COS({ SecretId, SecretKey });
  }

  async readJson<T>(key: string): Promise<T | null> {
    try {
      const result = await this.cos.getObject({
        Bucket: this.bucket,
        Region: this.region,
        Key: key,
      });
      const body = Buffer.isBuffer(result.Body)
        ? result.Body.toString('utf8')
        : String(result.Body || '');
      return JSON.parse(body) as T;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404) return null;
      throw error;
    }
  }

  async writeJson<T>(key: string, value: T): Promise<void> {
    await this.cos.putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Body: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'),
      ContentType: 'application/json; charset=utf-8',
    });
  }

  async writeBytes(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    await this.cos.putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: contentType,
    });
    return this.publicBaseUrl
      ? `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`
      : `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;
  }
}
