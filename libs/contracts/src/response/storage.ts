import { z } from 'zod';

/**
 * 存储面响应契约（S7b·上传面真相源 = `FileUploadResultDto`（service 产 plain object）；
 * delete/url 为 controller 内联字面返回）。
 */

/**
 * 文件上传结果（`FileUploadResultDto` 出线面）。
 *
 * @public
 */
export const fileUploadResultSchema = z.object({
  /** File unique identifier. */
  key: z.string(),
  /** File access URL. */
  url: z.string(),
  /** File ETag value. */
  etag: z.string().optional(),
  /** File size (bytes). */
  size: z.number(),
  /** File MIME type. */
  mimetype: z.string(),
  /** Original filename. */
  originalname: z.string(),
});
export type FileUploadResult = z.infer<typeof fileUploadResultSchema>;

/**
 * `DELETE /storage/:key`：`{success}`。
 *
 * @public
 */
export const storageDeleteSchema = z.object({
  success: z.boolean(),
});

/**
 * `GET /storage/url/:key` 类面：`{url}` 签名访问 URL。
 *
 * @public
 */
export const storageUrlSchema = z.object({
  url: z.string(),
});
