import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationExempt } from '@core/saas-kit/tenant-isolation/tenant-isolation-exempt.decorator';
import {
  BadRequestException,
  Controller,
  HttpException,
  Inject,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { SerializeOptions } from '@nestjs/common/serializer/index.js';
import {
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Impl } from '@orpc/nest';
import {
  storageDeleteContract,
  storageDeleteMeta,
  storageUrlContract,
  storageUrlMeta,
} from '@saas/api-contract/index';
import {
  fileUploadResultSchema,
  storageDeleteInputSchema,
  storageDeleteSchema,
  storageUrlInputSchema,
  storageUrlSchema,
} from '@saas/contracts/index';
import type { FastifyRequest } from 'fastify';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
} from '../../../common/contracts/api-contracts';
import { os } from '../../../common/orpc/orpc';
import { StorageService } from '../application/storage.service';
import { FileUploadResultDto } from './dto/file-upload.dto';
import { StorageDeleteResponse, StorageUrlResponse } from './response/storage.response';

/**
 * 存储面端点（上传 / 删除 / 签名 URL）。
 *
 * @remarks
 * S11 复合全局：storage 属用户级（上传/下载·不经租户仓储 `requireActiveOrganizationId`）
 * → 类级豁免全局租户墙（仍靠会话墙）。
 * @public
 */
// 换轨 WP-C：deleteFile/getFileUrl 转 per-method `@Impl`（路径参 `:key`〔+ getFileUrl query `expiresIn`〕经
// 非-strict 合并 input 入单一对象·出线 `.output` 承旧 `@SerializeOptions` 白名单）。
// **upload 保留 REST**：单文件 multipart 直走 Fastify `req.isMultipart()/req.file()` 原始流（非 JSON-RPC
// 形·强转 oRPC upload 会改真实上传流水线）——同 §2-1 传输入口保留口径。
// 契约 + meta 定义单源已前置 `@saas/api-contract`；re-export 保下游（AppRouterContract/覆盖测）拿到同一物体。
export { storageDeleteContract, storageUrlContract };

@ApiExtraModels(
  ApiEnvelope,
  ApiErrorResponse,
  FileUploadResultDto,
  StorageDeleteResponse,
  StorageUrlResponse,
)
@ApiTags('storage')
// S11 复合全局：storage 属用户级（上传/下载·不经租户仓储 requireActiveOrganizationId）→ 类级豁免全局租户墙（仍靠会话墙）。
@TenantIsolationExempt()
@Controller('')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(@Inject(StorageService) private readonly storageService: StorageService) {}

  /**
   * 单文件 multipart 上传（非 multipart → 400；领域校验/通道失败归一 400）。
   * @param req - Fastify 原始请求（取 multipart 文件流）。
   * @returns 上传结果 DTO（键/URL/元数据）。
   *
   * @throws {BadRequestException} 文件上传失败时。
   */
  @Post('storage/upload')
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
      return await this.storageService.uploadMultipartFile({
        filename: data.filename,
        mimetype: data.mimetype,
        file: data.file,
        size: data.file.bytesRead,
      });
    } catch (error) {
      // 甲档收口（module-storage-upload-error-surface）：补 `await` 使 service 的异步 reject
      // 落回本 catch；领域校验码（`NO_FILE` / service 的 `FILE_TOO_LARGE`/`FILE_TYPE_NOT_ALLOWED`
      // / provider 归一的 `UPLOAD_FAILED`）皆为 `HttpException`，原样放行使其在 HTTP 面正确显形；
      // 仅对非 `HttpException` 的真未知/流层异常兜底归一为 `STORAGE_UPLOAD_FAILED`。
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Error uploading file', error);
      throw new BadRequestException(`Failed to upload file: ${(error as Error).message}`, {
        errorCode: ERROR_CODES.STORAGE_UPLOAD_FAILED,
      });
    }
  }

  /**
   * 删除文件。
   * @param key - 路径参数：对象唯一键。
   * @returns `{ success }` —— 删除是否成功。
   */
  @Impl(storageDeleteContract)
  deleteFile() {
    return os
      .input(storageDeleteInputSchema)
      .output(storageDeleteSchema)
      .meta(storageDeleteMeta)
      .handler(async ({ input }) => {
        this.logger.log(`Deleting file with key: ${input.key}`);
        const result = await this.storageService.deleteFile(input.key);
        return { success: result };
      });
  }

  /**
   * 取文件的签名访问 URL。
   * @param key - 路径参数：对象唯一键。
   * @param expiresIn - 查询参数：有效期（秒，可选）。
   * @returns `{ url }` —— 签名访问 URL。
   */
  @Impl(storageUrlContract)
  getFileUrl() {
    return os
      .input(storageUrlInputSchema)
      .output(storageUrlSchema)
      .meta(storageUrlMeta)
      .handler(async ({ input }) => {
        this.logger.log(`Getting signed URL for file with key: ${input.key}`);
        const url = await this.storageService.getFileUrl(input.key, input.expiresIn);
        return { url };
      });
  }
}
