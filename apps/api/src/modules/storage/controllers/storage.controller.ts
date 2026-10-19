import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantExempt } from '@core/saas-kit/tenancy/tenant-exempt.decorator';
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { SerializeOptions } from '@nestjs/common/serializer/index.js';
import {
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  fileUploadResultSchema,
  storageDeleteSchema,
  storageExpiresInQuerySchema,
  storageUrlSchema,
} from '@saas/contracts/index';
import type { FastifyRequest } from 'fastify';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
} from '../../../common/contracts/api-contracts';
import { FileUploadResultDto } from '../dto/file-upload.dto';
import { StorageService } from '../services/storage.service';
import { StorageDeleteResponse, StorageUrlResponse } from './response/storage.response';

@ApiExtraModels(
  ApiEnvelope,
  ApiErrorResponse,
  FileUploadResultDto,
  StorageDeleteResponse,
  StorageUrlResponse,
)
@ApiTags('storage')
// S11 复合全局：storage 属用户级（上传/下载·不经租户仓储 requireTenantId）→ 类级豁免全局租户墙（仍靠会话墙）。
@TenantExempt()
@Controller('storage')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(@Inject(StorageService) private readonly storageService: StorageService) {}

  @Post('upload')
  @SerializeOptions({ schema: fileUploadResultSchema })
  @ApiOperation({ summary: 'Upload a single file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File to upload',
        },
      },
    },
  })
  @ApiResponse(
    apiEnvelopeShape(FileUploadResultDto, { status: 201, description: 'Uploaded file result.' }),
  )
  async uploadFile(@Req() req: FastifyRequest): Promise<FileUploadResultDto> {
    // Handle raw multipart upload using Fastify's built-in multipart support
    if (!req.isMultipart()) {
      throw new BadRequestException('Request is not multipart', {
        errorCode: ERROR_CODES.STORAGE_NOT_MULTIPART,
      });
    }

    try {
      const data = await req.file();

      if (!data) {
        throw new BadRequestException('No file uploaded', {
          errorCode: ERROR_CODES.STORAGE_NO_FILE,
        });
      }

      this.logger.log(`Uploading file: ${data.filename}`);

      // Handle multipart file upload
      return this.storageService.uploadMultipartFile({
        filename: data.filename,
        mimetype: data.mimetype,
        file: data.file,
        size: data.file.bytesRead,
      });
    } catch (error) {
      this.logger.error('Error uploading file', error);
      throw new BadRequestException(`Failed to upload file: ${error.message}`, {
        errorCode: ERROR_CODES.STORAGE_UPLOAD_FAILED,
      });
    }
  }

  @Delete(':key')
  @SerializeOptions({ schema: storageDeleteSchema })
  @ApiOperation({ summary: 'Delete a file' })
  @ApiParam({ name: 'key', description: 'Unique identifier of the file' })
  @ApiResponse(apiEnvelopeShape(StorageDeleteResponse, { description: 'Delete result.' }))
  async deleteFile(@Param('key') key: string): Promise<{ success: boolean }> {
    this.logger.log(`Deleting file with key: ${key}`);
    const result = await this.storageService.deleteFile(key);
    return { success: result };
  }

  @Get(':key/url')
  @SerializeOptions({ schema: storageUrlSchema })
  @ApiOperation({ summary: 'Get a signed URL for a file' })
  @ApiParam({ name: 'key', description: 'Unique identifier of the file' })
  @ApiQuery({
    name: 'expiresIn',
    required: false,
    description: 'Expiration time for URL (seconds)',
    type: Number,
  })
  @ApiResponse(apiEnvelopeShape(StorageUrlResponse, { description: 'Signed URL payload.' }))
  async getFileUrl(
    @Param('key') key: string,
    @Query('expiresIn', { schema: storageExpiresInQuerySchema }) expiresIn?: number,
  ): Promise<{ url: string }> {
    this.logger.log(`Getting signed URL for file with key: ${key}`);
    const url = await this.storageService.getFileUrl(key, expiresIn);
    return { url };
  }
}
