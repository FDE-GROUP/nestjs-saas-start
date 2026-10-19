import { z } from 'zod';
import { cursorPageSchema } from './page';

/**
 * posts 上下文响应契约（S7b·真相源 = `PostReadModel`·apps 侧编译期双向赋值锁锚定）。
 * 白名单面：未声明字段被 strip（PII fail-closed）；Date 内存形态经 JSON 出线为 ISO（wire 不变）。
 */
export const postViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().nullable(),
  published: z.boolean(),
  /** 所属租户（ALS 盖章，body 不接受）。 */
  organizationId: z.string(),
  /** 所属工作区；NULL = 未分区。 */
  workspaceId: z.string().nullable(),
  createdAt: z.instanceof(Date),
  updatedAt: z.instanceof(Date),
});
export type PostView = z.infer<typeof postViewSchema>;

/** 游标分页整体响应（`CursorPage<PostReadModel>`）。 */
export const postCursorPageSchema = cursorPageSchema(postViewSchema);
export type PostCursorPage = z.infer<typeof postCursorPageSchema>;
