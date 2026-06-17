declare module 'cos-nodejs-sdk-v5' {
  interface CosOptions {
    SecretId: string;
    SecretKey: string;
  }

  interface ObjectOptions {
    Bucket: string;
    Region: string;
    Key: string;
    Body?: Buffer;
    ContentType?: string;
  }

  export default class COS {
    constructor(options: CosOptions);
    getObject(options: ObjectOptions): Promise<{ Body?: Buffer | string; statusCode?: number }>;
    putObject(options: ObjectOptions): Promise<unknown>;
  }
}
