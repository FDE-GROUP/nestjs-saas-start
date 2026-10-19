/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
import type { PostRecord } from '../../domain/repositories/post.repository';

/**
 * Read-model projection for tenant-scoped post queries (CQRS read side).
 * Currently mirrors the persisted row; kept as a distinct type so the public shape can
 * diverge from storage without touching the repository.
 */
export interface PostReadModel extends PostRecord {}
