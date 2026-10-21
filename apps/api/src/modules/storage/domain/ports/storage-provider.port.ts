import type { ReadStream } from 'fs';

/**
 * 存储提供方端口（出站网关·domain 拥有接口、infrastructure 提供实现）。
 *
 * 原居 `providers/storage.interface.ts`，随分层对齐下沉至 `domain/ports`：
 * 领域只依赖本接口，具体通道（s3/alioss/tencentcos）由 `StorageModule.register()`
 * 依配置装配、`StorageService` 依 `storage.provider` 选择。零框架依赖（仅 node 流类型）。
 */
export interface FileUploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  acl?: string;
}

export interface UploadedFileResult {
  key: string;
  url: string;
  etag?: string;
  size: number;
  mimetype: string;
  originalname: string;
}

export interface StorageProvider {
  /**
   * Upload file
   * @param fileBuffer - File buffer
   * @param filename - Filename
   * @param options - Upload options
   */
  uploadFile(
    fileBuffer: Buffer,
    filename: string,
    options?: FileUploadOptions,
  ): Promise<UploadedFileResult>;

  /**
   * Upload file from stream
   * @param fileStream - File stream
   * @param filename - Filename
   * @param options - Upload options
   */
  uploadFileFromStream(
    fileStream: ReadStream,
    filename: string,
    options?: FileUploadOptions,
  ): Promise<UploadedFileResult>;

  /**
   * 从 HTTP multipart 原始流上传：落临时文件 → 流式上传 → 清理。
   *
   * 属基础设施关注点（fs/临时文件 IO），故由 `BaseStorageProvider` 统一实现，
   * `application` 层只委托、不碰 `fs`/`path`。
   */
  uploadMultipart(input: {
    stream: NodeJS.ReadableStream;
    filename: string;
    contentType: string;
  }): Promise<UploadedFileResult>;

  /**
   * Delete file
   * @param key - Unique file identifier
   */
  deleteFile(key: string): Promise<boolean>;

  /**
   * Get file URL
   * @param key - Unique file identifier
   * @param expiresIn - URL expiration time (seconds)
   */
  getFileUrl(key: string, expiresIn?: number): Promise<string>;
}
