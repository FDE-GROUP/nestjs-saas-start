import type { ReadStream } from 'node:fs';
import { ConfigService } from '@app/config/config.service';
import { Inject, Injectable } from '@nestjs/common';
import * as COS from 'cos-nodejs-sdk-v5';
import type {
  FileUploadOptions,
  StorageProvider,
  UploadedFileResult,
} from '../domain/ports/storage-provider.port';
import { BaseStorageProvider } from './base-storage.provider';

@Injectable()
export class TencentCosStorageProvider extends BaseStorageProvider implements StorageProvider {
  private readonly cosClient: COS;
  private readonly region: string;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    super(configService);
    const storageConfig = configService.getStorageConfig();

    this.cosClient = new COS.default({
      SecretId: storageConfig.accessKeyId,
      SecretKey: storageConfig.accessKeySecret,
    });

    this.region = storageConfig.region ?? '';
  }

  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    options: FileUploadOptions = {},
  ): Promise<UploadedFileResult> {
    const key = this.generateKey(filename);
    const contentType = this.resolveContentType(options);

    return this.putObject(fileBuffer, key, contentType, filename, fileBuffer.length, 'file');
  }

  async uploadFileFromStream(
    fileStream: ReadStream,
    filename: string,
    options: FileUploadOptions = {},
  ): Promise<UploadedFileResult> {
    const key = this.generateKey(filename);
    const contentType = this.resolveContentType(options);

    return this.putObject(fileStream, key, contentType, filename, -1, 'file stream');
  }

  async deleteFile(key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.cosClient.deleteObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
        },
        (err) => {
          if (err) {
            reject(new Error(`Failed to delete file from Tencent COS: ${err.message}`));
            return;
          }

          resolve(true);
        },
      );
    });
  }

  async getFileUrl(key: string, expiresIn = 3600): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        // Use signed URL to access files in private buckets
        this.cosClient.getObjectUrl(
          {
            Bucket: this.bucket,
            Region: this.region,
            Key: key,
            Expires: expiresIn,
            Sign: true,
          },
          (err, data) => {
            if (err) {
              reject(new Error(`Failed to generate signed URL: ${err.message}`));
              return;
            }

            resolve(data.Url);
          },
        );
      } catch (error) {
        reject(new Error(`Failed to generate signed URL: ${error.message}`));
      }
    });
  }

  protected getDefaultPublicUrl(key: string): string {
    // Tencent Cloud COS default URL format
    return `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;
  }

  private putObject(
    body: Buffer | ReadStream,
    key: string,
    contentType: string,
    filename: string,
    size: number,
    label: string,
  ): Promise<UploadedFileResult> {
    return new Promise((resolve, reject) => {
      // Tencent Cloud COS SDK uses callback approach
      this.cosClient.putObject(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          Body: body,
          ContentType: contentType,
          // Due to type issues, use any type directly
        } as any,
        (err, data) => {
          if (err) {
            reject(new Error(`Failed to upload ${label} to Tencent COS: ${err.message}`));
            return;
          }

          resolve(
            this.buildResult({
              key,
              filename,
              contentType,
              size,
              etag: this.normalizeEtag(data.ETag),
            }),
          );
        },
      );
    });
  }
}
