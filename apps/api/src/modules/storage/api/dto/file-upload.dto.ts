import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { fileUploadResultSchema } from '@saas/contracts/index';
import type { z } from 'zod';

/**
 * 文件上传结果响应 DTO（Swagger $ref 源·与 contracts zod 单源由文末编译期锁对拍）。
 * @public
 */
export class FileUploadResultDto {
  @ApiProperty({ description: 'File unique identifier' })
  key: string;

  @ApiProperty({ description: 'File access URL' })
  url: string;

  @ApiPropertyOptional({ description: 'File ETag value' })
  etag?: string;

  @ApiProperty({ description: 'File size (bytes)' })
  size: number;

  @ApiProperty({ description: 'File MIME type' })
  mimetype: string;

  @ApiProperty({ description: 'Original filename' })
  originalname: string;
}

// S7b serialization contract lock: contracts zod single-source output ≡ this response DTO.
const _fur1: z.infer<typeof fileUploadResultSchema> = {} as FileUploadResultDto;
const _fur2: FileUploadResultDto = {} as z.infer<typeof fileUploadResultSchema>;
void _fur1;
void _fur2;
