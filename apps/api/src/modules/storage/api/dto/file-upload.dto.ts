import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { fileUploadResultSchema } from '@saas/contracts/index';
import type { z } from 'zod';

/**
 * 文件上传结果响应 DTO（Swagger $ref 源·与 contracts zod 单源由文末编译期锁对拍）。
 * @public
 */
export class FileUploadResultDto {
  /** 对象存储 key。 */
  @ApiProperty({ description: 'File unique identifier' })
  key: string;

  /** 访问 URL。 */
  @ApiProperty({ description: 'File access URL' })
  url: string;

  /** 存储对象 etag（内容标识）。 */
  @ApiPropertyOptional({ description: 'File ETag value' })
  etag?: string;

  /** 字节大小。 */
  @ApiProperty({ description: 'File size (bytes)' })
  size: number;

  /** 文件 MIME 类型。 */
  @ApiProperty({ description: 'File MIME type' })
  mimetype: string;

  /** 上传文件原始文件名。 */
  @ApiProperty({ description: 'Original filename' })
  originalname: string;
}

// S7b serialization contract lock: contracts zod single-source output ≡ this response DTO.
const _fur1: z.infer<typeof fileUploadResultSchema> = {} as FileUploadResultDto;
const _fur2: FileUploadResultDto = {} as z.infer<typeof fileUploadResultSchema>;
void _fur1;
void _fur2;
