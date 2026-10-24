import { ApiProperty } from '@nestjs/swagger';
import type { storageDeleteSchema, storageUrlSchema } from '@saas/contracts/index';
import type { z } from 'zod';

/**
 * 存储面响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 *
 * @remarks
 * 上传面复用既存 DTO `FileUploadResultDto`（已带 @ApiProperty·直接作 $ref 源，不重复造）；
 * 此处仅补 delete/url 两内联字面返回的类（controller 直返 `{success}`/`{url}`·无独立真相源类型）。
 * @public
 */
export class StorageDeleteResponse {
  /** 是否成功。 */
  @ApiProperty({ description: '删除是否成功。' })
  success!: boolean;
}

/**
 * 签名 URL 响应契约（与 controller 直返 `{url}` 同形·编译期锁防漂移）。
 * @public
 */
export class StorageUrlResponse {
  /** 签名访问 URL。 */
  @ApiProperty({ description: '签名访问 URL。' })
  url!: string;
}

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 内联字面形。——
const _std1: z.infer<typeof storageDeleteSchema> = {} as StorageDeleteResponse;
const _std2: StorageDeleteResponse = {} as z.infer<typeof storageDeleteSchema>;
const _stu1: z.infer<typeof storageUrlSchema> = {} as StorageUrlResponse;
const _stu2: StorageUrlResponse = {} as z.infer<typeof storageUrlSchema>;
void _std1;
void _std2;
void _stu1;
void _stu2;
