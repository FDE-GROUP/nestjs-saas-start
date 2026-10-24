import { z } from 'zod';
import { offsetPageSchema } from './page';

/**
 * workspaces 上下文响应契约（S7b·真相源 = `WorkspaceReadModel`）。
 */

/**
 * 工作区视图（`WorkspaceReadModel` 白名单出线面）。
 *
 * @public
 */
export const workspaceViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  /** 所属租户（仓储盖章）。 */
  organizationId: z.string(),
  /** 实例属主；NULL/缺省 = 不属任何人（owner-column 片语义）。 */
  ownerId: z.string().nullable().optional(),
  createdAt: z.instanceof(Date),
  updatedAt: z.instanceof(Date),
});
export type WorkspaceView = z.infer<typeof workspaceViewSchema>;

/**
 * offset 分页整体响应（`Page<WorkspaceReadModel>`）。
 *
 * @public
 */
export const workspacePageSchema = offsetPageSchema(workspaceViewSchema);
export type WorkspacePage = z.infer<typeof workspacePageSchema>;
