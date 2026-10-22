import { z } from 'zod';
import { reqStringMax } from '../helpers';
import { strictObject } from '../strict';

/** URL 友好 slug 形态（小写字母/数字，段首尾不可为连字符）——与旧 DTO `@Matches` 同源。 */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** 创建工作区入参（旧 `CreateWorkspaceDto`）。 */
export const createWorkspaceSchema = strictObject({
  name: reqStringMax('validate.name.required', 200),
  slug: reqStringMax('validate.slug.required', 128).regex(SLUG_PATTERN, {
    error: 'validate.slug.invalid',
  }),
});
export type CreateWorkspace = z.infer<typeof createWorkspaceSchema>;

/** 更新工作区入参（旧 `UpdateWorkspaceDto`·均可选，present 才校验）。 */
export const updateWorkspaceSchema = strictObject({
  name: reqStringMax('validate.name.required', 200).optional(),
  slug: z
    .string()
    .max(128, { error: 'validate.text.maxLength' })
    .regex(SLUG_PATTERN, { error: 'validate.slug.invalid' })
    .optional(),
});
export type UpdateWorkspace = z.infer<typeof updateWorkspaceSchema>;
