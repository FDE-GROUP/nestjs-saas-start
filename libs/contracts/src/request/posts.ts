import { z } from 'zod';
import { optStringMax, reqStringMax } from '../helpers';
import { strictObject } from '../strict';
import { listCursorQuerySchema } from './pagination';

/**
 * 创建 post 入参（旧 `CreatePostDto`·@Body JSON）。
 *
 * @public
 */
export const createPostSchema = strictObject({
  title: reqStringMax('validate.title.required', 200),
  content: optStringMax(20000),
  published: z.boolean().optional(),
});
export type CreatePost = z.infer<typeof createPostSchema>;

/**
 * 列出 post 入参（游标分页 + 可选组织收窄维·global-tenant-organization-rehierarchy 切片 E-F）。
 *
 * @remarks
 * 隔离主轴恒为可信 `tenantId`（ALS 派生·非本 DTO 字段）；`organizationId` 仅作**租内可选收窄筛选维**
 * （同租跨组织默认互见，传值即只留该组织的行）——外来 org 与可信租户谓词 AND 后恒命中 0 行，绝不越租/括宽。
 *
 * @public
 */
export const listPostsQuerySchema = listCursorQuerySchema.extend({
  organizationId: optStringMax(128),
});
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
