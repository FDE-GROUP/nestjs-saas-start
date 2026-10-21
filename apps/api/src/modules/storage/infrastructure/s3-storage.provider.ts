import type { ReadStream } from 'node:fs';
import { ConfigService } from '@app/config/config.service';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  type ObjectCannedACL,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import type {
  FileUploadOptions,
  StorageProvider,
  UploadedFileResult,
} from '../domain/ports/storage-provider.port';
import { BaseStorageProvider } from './base-storage.provider';

@Injectable()
export class S3StorageProvider extends BaseStorageProvider implements StorageProvider {
  private readonly s3Client: S3Client;
  private readonly region: string;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    super(configService);
    const storageConfig = configService.getStorageConfig();

    const s3Config: any = {
      region: storageConfig.region,
      credentials: {
        accessKeyId: storageConfig.accessKeyId,
        secretAccessKey: storageConfig.accessKeySecret,
      },
    };

    // If a custom endpoint is set, add it to the configuration
    if (storageConfig.endpoint) {
      s3Config.endpoint = storageConfig.endpoint;
      s3Config.forcePathStyle = true; // For MinIO or other S3-compatible services
    }

    this.s3Client = new S3Client(s3Config);
    this.region = storageConfig.region ?? '';
  }

  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    options: FileUploadOptions = {},
  ): Promise<UploadedFileResult> {
    const key = this.generateKey(filename);
    const contentType = this.resolveContentType(options);

    const params = this.buildParams(key, fileBuffer, contentType, options);

    try {
      const command = new PutObjectCommand(params);
      const result = await this.s3Client.send(command);

      return this.buildResult({
        key,
        filename,
        contentType,
        size: fileBuffer.length,
        etag: this.normalizeEtag(result.ETag),
      });
    } catch (error) {
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  async uploadFileFromStream(
    fileStream: ReadStream,
    filename: string,
    options: FileUploadOptions = {},
  ): Promise<UploadedFileResult> {
    const key = this.generateKey(filename);
    const contentType = this.resolveContentType(options);

    const params = this.buildParams(key, fileStream, contentType, options);

    try {
      // Using multipart upload is better for handling large files
      const upload = new Upload({
        client: this.s3Client,
        params,
      });

      const result = await upload.done();

      return this.buildResult({
        key,
        filename,
        contentType,
        size: -1, // Unable to directly get file size when uploading stream
        etag: this.normalizeEtag(result.ETag),
      });
    } catch (error) {
      throw new Error(`Failed to upload file stream to S3: ${error.message}`);
    }
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
  }

  async getFileUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  protected getDefaultPublicUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  private buildParams(
    key: string,
    body: Buffer | ReadStream,
    contentType: string,
    options: FileUploadOptions,
  ): any {
    return {
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: options.metadata,
      ACL: (options.acl as ObjectCannedACL) || 'private',
    };
  }
}
