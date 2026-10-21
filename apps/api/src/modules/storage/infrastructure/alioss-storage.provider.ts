import type { ReadStream } from 'node:fs';
import { ConfigService } from '@app/config/config.service';
import { Inject, Injectable } from '@nestjs/common';
import OSS from 'ali-oss';
import type {
  FileUploadOptions,
  StorageProvider,
  UploadedFileResult,
} from '../domain/ports/storage-provider.port';
import { BaseStorageProvider } from './base-storage.provider';

@Injectable()
export class AliOssStorageProvider extends BaseStorageProvider implements StorageProvider {
  private readonly ossClient: OSS;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    super(configService);
    const storageConfig = configService.getStorageConfig();

    this.ossClient = new OSS({
      region: storageConfig.region,
      accessKeyId: storageConfig.accessKeyId,
      accessKeySecret: storageConfig.accessKeySecret,
      bucket: storageConfig.bucket,
      endpoint: storageConfig.endpoint,
    });
  }

  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    options: FileUploadOptions = {},
  ): Promise<UploadedFileResult> {
    const key = this.generateKey(filename);
    const contentType = this.resolveContentType(options);

    try {
      const result = await this.ossClient.put(key, fileBuffer, {
        headers: this.buildHeaders(contentType, options),
        timeout: 60000, // 60 seconds timeout
      } as any);

      return this.buildResult({
        key,
        filename,
        contentType,
        size: fileBuffer.length,
        etag: this.normalizeEtag(this.extractEtag(result)),
      });
    } catch (error) {
      throw new Error(`Failed to upload file to Ali OSS: ${error.message}`);
    }
  }

  async uploadFileFromStream(
    fileStream: ReadStream,
    filename: string,
    options: FileUploadOptions = {},
  ): Promise<UploadedFileResult> {
    const key = this.generateKey(filename);
    const contentType = this.resolveContentType(options);

    try {
      const result = await this.ossClient.putStream(key, fileStream, {
        headers: this.buildHeaders(contentType, options),
        timeout: 60000, // 60 seconds timeout
      } as any);

      return this.buildResult({
        key,
        filename,
        contentType,
        size: -1, // Unable to directly get file size when uploading stream
        etag: this.normalizeEtag(this.extractEtag(result)),
      });
    } catch (error) {
      throw new Error(`Failed to upload file stream to Ali OSS: ${error.message}`);
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      await this.ossClient.delete(key);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete file from Ali OSS: ${error.message}`);
    }
  }

  async getFileUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      // Alibaba Cloud OSS generates URLs with signature information, suitable for private buckets
      const signedUrl = this.ossClient.signatureUrl(key, {
        expires: expiresIn,
      });

      return await Promise.resolve(signedUrl);
    } catch (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  protected getDefaultPublicUrl(key: string): string {
    const storage = this.configService.getStorageConfig();
    const endpoint = storage.endpoint || `oss-${storage.region}.aliyuncs.com`;
    return `https://${this.bucket}.${endpoint}/${key}`;
  }

  private buildHeaders(contentType: string, options: FileUploadOptions): Record<string, string> {
    const headers: Record<string, string> = {
      'x-oss-object-acl': options?.acl || 'private',
      'Content-Type': contentType,
    };

    if (options?.metadata) {
      for (const [metaKey, metaValue] of Object.entries(options.metadata)) {
        headers[`x-oss-meta-${metaKey}`] = String(metaValue);
      }
    }

    return headers;
  }

  private extractEtag(result: { res?: unknown }): string | undefined {
    const headers = (result.res as { headers?: Record<string, unknown> } | undefined)?.headers;
    return headers && 'etag' in headers ? String(headers.etag) : undefined;
  }
}
