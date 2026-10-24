import type { ReadStream } from 'fs';

/**
 * 上传选项（内容类型 / 元数据 / ACL）。
 * @public
 */
export interface FileUploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  acl?: string;
}

/**
 * 上传成功结果（对象键 + 访问 URL + 尺寸/类型/原始名等元数据）。
 * @public
 */
export interface UploadedFileResult {
  key: string;
  url: string;
  etag?: string;
  size: number;
  mimetype: string;
  originalname: string;
}

/**
 * 存储提供方端口（出站网关·domain 拥有接口、infrastructure 提供实现）。
 *
 * @remarks
 * 原居 `providers/storage.interface.ts`，随分层对齐下沉至 `domain/ports`：
 * 领域只依赖本接口，具体通道（s3/alioss/tencentcos）由 `StorageModule.register()`
 * 依配置装配、`StorageService` 依 `storage.provider` 选择。零框架依赖（仅 node 流类型）。
 * @public
 */
export interface StorageProvider {
  /**
   * 缓冲区上传文件。
   * @param fileBuffer - 文件内容缓冲。
   * @param filename - 文件名。
   * @param options - 上传选项。
   * @returns 上传结果（键/URL/元数据）。
   */
  uploadFile(
    fileBuffer: Buffer,
    filename: string,
    options?: FileUploadOptions,
  ): Promise<UploadedFileResult>;

  /**
   * 从可读流上传文件。
   * @param fileStream - 文件流。
   * @param filename - 文件名。
   * @param options - 上传选项。
   * @returns 上传结果（键/URL/元数据）。
   */
  uploadFileFromStream(
    fileStream: ReadStream,
    filename: string,
    options?: FileUploadOptions,
  ): Promise<UploadedFileResult>;

  /**
   * 从 HTTP multipart 原始流上传：落临时文件 → 流式上传 → 清理。
   *
   * @remarks
   * 属基础设施关注点（fs/临时文件 IO），故由 `BaseStorageProvider` 统一实现，
   * `application` 层只委托、不碰 `fs`/`path`。
   * @param input - 原始流 + 文件名 + 内容类型。
   * @returns 上传结果（键/URL/元数据）。
   */
  uploadMultipart(input: {
    stream: NodeJS.ReadableStream;
    filename: string;
    contentType: string;
  }): Promise<UploadedFileResult>;

  /**
   * 删除文件。
   * @param key - 对象唯一键。
   * @returns 删除成功时为 `true`。
   */
  deleteFile(key: string): Promise<boolean>;

  /**
   * 取文件访问 URL（可签名时效）。
   * @param key - 对象唯一键。
   * @param expiresIn - URL 有效期（秒）；缺省由实现方定。
   * @returns 可访问的 URL 串。
   */
  getFileUrl(key: string, expiresIn?: number): Promise<string>;
}
