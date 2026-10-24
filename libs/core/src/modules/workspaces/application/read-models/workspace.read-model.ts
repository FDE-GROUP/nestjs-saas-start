/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
import type { WorkspaceRecord } from '../../domain/repositories/workspace.repository';

/**
 * 租户内 workspace 查询的读模型投影（CQRS 读侧出参）。
 *
 * @remarks
 * Read-model projection for tenant-scoped workspace queries (CQRS read side).
 * Mirrors the persisted row; kept distinct so the public shape can diverge from storage.
 *
 * @public
 */
export interface WorkspaceReadModel extends WorkspaceRecord {}
