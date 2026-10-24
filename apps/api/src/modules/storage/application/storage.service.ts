import { ConfigService } from '@app/config/config.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { selectStorageProvider } from '../domain/policies/provider-selection.policy';
import { evaluateUpload } from '../domain/policies/upload.policy';
import type { StorageProvider, UploadedFileResult } from '../domain/ports/storage-provider.port';

/**
 * 存储门面（application 编排层·imperative shell）。
 *
 * @remarks
 * 分层对齐后仅负责编排：调 `domain` 的通道选择/降级策略拿 provider、
 * 调 `domain` 的上传校验策略并映射为 HTTP 异常，再委托端口执行 IO。
 * 临时文件 / 流式上传等基础设施关注点已下沉 `BaseStorageProvider`——本层不碰 `fs`/`path`。
 * @public
 */
@Injectable()
export class StorageService {
  private readonly storageProvider: StorageProvider;
  private readonly maxFileSize: number;
  private readonly allowedMimeTypes: string[];

  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject('STORAGE_PROVIDERS') storageProviders: Record<string, StorageProvider>,
  ) {
    const storageConfig = configService.getStorageConfig();

    // 选择配置指定的存储提供者（未注册则回落 s3）——裁决下沉 domain。
    this.storageProvider = selectStorageProvider(storageProviders, storageConfig.provider);

    this.maxFileSize = storageConfig.maxFileSize;
    this.allowedMimeTypes = storageConfig.allowedMimeTypes;
  }

  /**
   * multipart 上传：先过 domain 校验闸（超限/非法类型 → 400），再委托通道落存。
   * @param file - 文件名/MIME/原始流/尺寸。
   * @returns 上传结果（键/URL/元数据）。
   */
  async uploadMultipartFile(file: {
    filename: string;
    mimetype: string;
    file: NodeJS.ReadableStream;
    size: number;
  }): Promise<UploadedFileResult> {
    // 校验闸（domain 纯策略）：先尺寸、后类型；触 IO 前 throw。
    const verdict = evaluateUpload(
      { size: file.size, mimetype: file.mimetype },
      { maxFileSize: this.maxFileSize, allowedMimeTypes: this.allowedMimeTypes },
    );
    if (!verdict.ok) {
      if (verdict.reason === 'too-large') {
        throw new BadRequestException(
          `File size exceeds the limit of ${this.maxFileSize / 1024 / 1024}MB`,
          { errorCode: ERROR_CODES.STORAGE_FILE_TOO_LARGE },
        );
      }
      throw new BadRequestException(
        `File type not allowed. Allowed types: ${this.allowedMimeTypes.join(', ')}`,
        { errorCode: ERROR_CODES.STORAGE_FILE_TYPE_NOT_ALLOWED },
      );
    }

    try {
      // 落临时文件 + 流式上传由基础设施适配器承担。
      return await this.storageProvider.uploadMultipart({
        stream: file.file,
        filename: file.filename,
        contentType: file.mimetype,
      });
    } catch (error) {
      throw new BadRequestException(`Failed to upload file: ${error.message}`, {
        errorCode: ERROR_CODES.STORAGE_UPLOAD_FAILED,
      });
    }
  }

  /**
   * 删除文件（透传通道裁决）。
   * @param key - 对象唯一键。
   * @returns 删除成功时为 `true`。
   */
  async deleteFile(key: string): Promise<boolean> {
    return this.storageProvider.deleteFile(key);
  }

  /**
   * 取文件访问 URL（可签名时效）。
   * @param key - 对象唯一键。
   * @param expiresIn - URL 有效期（秒）；缺省由实现方定。
   * @returns 可访问的 URL 串。
   */
  async getFileUrl(key: string, expiresIn?: number): Promise<string> {
    return this.storageProvider.getFileUrl(key, expiresIn);
  }
}
