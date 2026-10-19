import { z } from 'zod';
import { reqString } from '../helpers';
import { strictObject } from '../strict';

/** URL 友好 slug 形态（小写字母/数字，段首尾不可为连字符）——与旧 DTO `@Matches` 同源。 */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** 创建工作区入参（旧 `CreateWorkspaceDto`）。 */
export const createWorkspaceSchema = strictObject({
  name: reqString('validate.name.required'),
  slug: reqString('validate.slug.required').regex(SLUG_PATTERN, { error: 'validate.slug.invalid' }),
});
export type CreateWorkspace = z.infer<typeof createWorkspaceSchema>;

/** 更新工作区入参（旧 `UpdateWorkspaceDto`·均可选，present 才校验）。 */
export const updateWorkspaceSchema = strictObject({
  name: z.string().min(1, { error: 'validate.name.required' }).optional(),
  slug: z.string().regex(SLUG_PATTERN, { error: 'validate.slug.invalid' }).optional(),
});
export type UpdateWorkspace = z.infer<typeof updateWorkspaceSchema>;
