/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
import type { Post } from '../../domain/entities/post';

/**
 * posts 上下文传输投影（application 层）：控制器/序列化契约（`@saas/contracts` `PostView`）的真相源。
 *
 * @remarks
 * 分层对齐后（module-posts-domain-entity-split）：端口流动**领域实体** `Post`，本接口是其在 application
 * 边界向 `api/` 输出的**传输形状**——领域实体本身绝不越界进 `api/`（architecture「Entity Doctrine」·
 * layer 依赖表 `api/` 行）。字段形状与旧 `PostRecord` 等价，故响应双向赋值锁零变更。
 * @public
 */
export interface PostReadModel {
  id: string;
  title: string;
  content: string | null;
  published: boolean;
  organizationId: string;
  workspaceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 领域实体 → 传输投影（映射归 application·不落在 domain 以免 domain 引 application 型）。
 *
 * @remarks
 * 仓储 `create/findById/list` 恒返回**已落库完整**实例（id/租户/时间戳非空），故对持久字段取断言——
 * `content`/`workspaceId` 的可空是业务语义（值或 null），与「未落库」无关。
 * @param post - 已落库的领域实体。
 * @returns 对应的传输投影 `PostReadModel`。
 * @public
 */
export function toPostReadModel(post: Post): PostReadModel {
  return {
    id: post.id as string,
    title: post.title,
    content: post.content,
    published: post.published,
    organizationId: post.organizationId as string,
    workspaceId: post.workspaceId,
    createdAt: post.createdAt as Date,
    updatedAt: post.updatedAt as Date,
  };
}
