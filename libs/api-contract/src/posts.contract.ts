/**
 * posts 域 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约前置）。
 *
 * @remarks
 * 租户级参考资源（游标分页列表 + 创建）。契约 = zod 输入/输出（`@saas/contracts` 单源）+ `openapi`
 * meta（method/path/successStatus·路由注册与响应码共用），与 `apps/api` posts controller 的 `os`
 * server procedure **共享同一 meta 物体**（故 controller import 本文件的 meta，不重复造）。
 * `successStatus` 用数值字面量（201·承 `HttpStatus.CREATED`），免纯契约包引 `@nestjs/common`。
 */
import {
  createPostSchema,
  listPostsQuerySchema,
  postCursorPageSchema,
  postViewSchema,
} from '@saas/contracts/index';
import { oc, openapi } from './base';

export const postsListMeta = openapi({
  method: 'GET',
  path: '/posts',
  summary: 'List posts in the active organization (cursor-paginated)',
});

export const postsCreateMeta = openapi({
  method: 'POST',
  path: '/posts',
  successStatus: 201,
  summary: 'Create a post in the active organization',
});

export const postsListContract = oc
  .input(listPostsQuerySchema)
  .output(postCursorPageSchema)
  .meta(postsListMeta);

export const postsCreateContract = oc
  .input(createPostSchema)
  .output(postViewSchema)
  .meta(postsCreateMeta);
