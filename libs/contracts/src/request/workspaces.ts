import { z } from 'zod';
import { reqStringMax } from '../helpers';
import { strictObject } from '../strict';

/** URL 友好 slug 形态（小写字母/数字，段首尾不可为连字符）——与旧 DTO `@Matches` 同源。 */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * 创建工作区入参（旧 `CreateWorkspaceDto`）。
 *
 * @public
 */
export const createWorkspaceSchema = strictObject({
  name: reqStringMax('validate.name.required', 200),
  slug: reqStringMax('validate.slug.required', 128).regex(SLUG_PATTERN, {
    error: 'validate.slug.invalid',
  }),
});
export type CreateWorkspace = z.infer<typeof createWorkspaceSchema>;

/**
 * 更新工作区入参（旧 `UpdateWorkspaceDto`·均可选，present 才校验）。
 *
 * @public
 */
export const updateWorkspaceSchema = strictObject({
  name: reqStringMax('validate.name.required', 200).optional(),
  slug: z
    .string()
    .max(128, { error: 'validate.text.maxLength' })
    .regex(SLUG_PATTERN, { error: 'validate.slug.invalid' })
    .optional(),
});
export type UpdateWorkspace = z.infer<typeof updateWorkspaceSchema>;

/**
 * 工作区路由参数（换轨 WP-C·oRPC procedure 输入单源）。
 *
 * @remarks
 * 旧 REST `@Param('id') id: string` 无独立校验（`:id` 命中即非空串）；此处以 `z.string()` 逐字保真
 * （不新增空串 400 门槛）。紧凑 input 结构下路径参 `{...body, ...params}` 平并入同一 input 对象，故 update 用
 * {@link updateWorkspaceInputSchema}（body ⊕ id），remove 仅用本参。
 */
export const workspaceIdParamSchema = strictObject({ id: z.string() });
export type WorkspaceIdParam = z.infer<typeof workspaceIdParamSchema>;

/** `PATCH /workspaces/:id` 合并入参（update body ⊕ 路径 `id`·`.extend` 承 strict 语义）。 */
export const updateWorkspaceInputSchema = updateWorkspaceSchema.extend({ id: z.string() });
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;
