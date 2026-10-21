import type { ReadStream } from 'node:fs';
import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import type { ConfigService } from '@app/config/config.service';
import { v4 as uuidv4 } from 'uuid';
import type {
  FileUploadOptions,
  StorageProvider,
  UploadedFileResult,
} from '../domain/ports/storage-provider.port';
import { buildStorageKey } from '../domain/value-objects/storage-key';

const pipelineAsync = promisify(pipeline);

/**
 * Shared plumbing for object-storage providers (S3-compatible, Ali OSS, Tencent COS).
 *
 * Centralises the parts that were byte-identical across the three adapters —
 * key generation, content-type defaulting, ETag normalisation, public-URL
 * fallback and result assembly — so each subclass only implements the
 * SDK-specific upload / delete / sign calls and its own default URL format.
 *
 * 分层对齐：`generateKey` 的命名规则下沉 `domain`（`buildStorageKey`），本类只注入
 * `new Date()` / `uuidv4()`；multipart 的临时文件 IO 亦归本基础设施层承担。
 */
export abstract class BaseStorageProvider implements StorageProvider {
  protected readonly bucket: string;
  protected readonly baseUrl: string;

  constructor(protected readonly configService: ConfigService) {
    const storageConfig = this.configService.getStorageConfig();
    this.bucket = storageConfig.bucket;
    this.baseUrl = storageConfig.baseUrl || '';
  }

  abstract uploadFile(
    fileBuffer: Buffer,
    filename: string,
    options?: FileUploadOptions,
  ): Promise<UploadedFileResult>;

  abstract uploadFileFromStream(
    fileStream: ReadStream,
    filename: string,
    options?: FileUploadOptions,
  ): Promise<UploadedFileResult>;

  abstract deleteFile(key: string): Promise<boolean>;

  abstract getFileUrl(key: string, expiresIn?: number): Promise<string>;

  /** Provider-specific default public URL when no custom baseUrl is configured. */
  protected abstract getDefaultPublicUrl(key: string): string;

  /**
   * 从 HTTP multipart 原始流上传：落临时文件 → 流式上传 → 清理。
   * 三通道一致，故在基类实现（application 层不碰 `fs`/`path`）。
   */
  async uploadMultipart(input: {
    stream: NodeJS.ReadableStream;
    filename: string;
    contentType: string;
  }): Promise<UploadedFileResult> {
    const tmpDir = join(process.cwd(), 'tmp');
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }

    const tmpFilePath = join(tmpDir, `${uuidv4()}${extname(input.filename)}`);

    try {
      await pipelineAsync(input.stream, createWriteStream(tmpFilePath));
      return await this.uploadFileFromStream(createReadStream(tmpFilePath), input.filename, {
        contentType: input.contentType,
      });
    } finally {
      if (existsSync(tmpFilePath)) {
        unlinkSync(tmpFilePath);
      }
    }
  }

  protected resolveContentType(options: FileUploadOptions = {}): string {
    return options.contentType || 'application/octet-stream';
  }

  /** Strip the surrounding quotes cloud vendors wrap around ETag values. */
  protected normalizeEtag(etag?: string): string | undefined {
    return etag?.replace(/"/g, '');
  }

  protected buildResult(input: {
    key: string;
    filename: string;
    contentType: string;
    /** Use `-1` when the size is unknown (stream uploads). */
    size: number;
    etag?: string;
  }): UploadedFileResult {
    return {
      key: input.key,
      url: this.getPublicUrl(input.key),
      etag: input.etag,
      size: input.size,
      mimetype: input.contentType,
      originalname: input.filename,
    };
  }

  /** `YYYY/MM/DD/<uuid><ext>` — 命名规则居 domain，此处仅注入时钟与 uuid。 */
  protected generateKey(filename: string): string {
    return buildStorageKey(filename, new Date(), uuidv4());
  }

  private getPublicUrl(key: string): string {
    return this.baseUrl ? `${this.baseUrl}/${key}` : this.getDefaultPublicUrl(key);
  }
}
