import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { Controller, Inject, UseGuards } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Impl } from '@orpc/nest';
import {
  postsCreateContract,
  postsCreateMeta,
  postsListContract,
  postsListMeta,
} from '@saas/api-contract/index';
import {
  createPostSchema,
  listPostsQuerySchema,
  type PostCursorPage,
  postCursorPageSchema,
  postViewSchema,
} from '@saas/contracts/index';
import { os } from '../../../common/orpc/orpc';

// 契约 + meta 定义单源已前置 `@saas/api-contract`（换轨 WP-E/#2·B 契约先行）；re-export 保下游
// （AppRouterContract/覆盖测）经本 controller 命名空间拿到的仍是同一 `ProcedureContract` 物体。
// meta 同由本包导出供下方 `os` server procedure 复用（同物体·ImplementInterceptor 从此读 successStatus）。
export { postsCreateContract, postsListContract };

import { CreatePostCommand } from '../application/commands/create-post.command';
import { ListPostsQuery } from '../application/queries/list-posts.query';
import type { PostReadModel } from '../application/read-models/post.read-model';

/**
 * posts 租户级参考资源的 oRPC 端点（多租户 S2 · FR-5 样板 · 换轨 WP-B 竖切）。
 *
 * @remarks
 * Reference tenant-scoped resource. Both procedures are gated by class-level
 * `TenantIsolationGuard` (fail-closed: no active tenant → 403) and read/write exclusively
 * through the tenant-scoped repository — the handler never names a tenant id.
 *
 * **ⓐ per-method `@Impl(procedureContract)`（非 router 扇出）**：`@orpc/nest` 对单个
 * `ProcedureContract` 走 `instanceof ProcedureContract` 分支，把 `@Get/@Post` 路由装饰器落在
 * **本方法本身**（而非生成 `router_*` 派生方法），故 class 级 `@UseGuards`、方法级 `@Can`、
 * 守卫抛出的 `HttpException`（经 `HttpExceptionFilter` 的 REST 错误形）全部原生保留——这是
 * 「不因换传输层而弱化 X7 P0 守卫墙」的落地形态。请求/响应校验下沉到 procedure 级
 * `.input/.output`（zod 单源·`@SerializeOptions` PII 白名单 → `.output` 等价），全局响应信封
 * 仍由 `TransformInterceptor` 包裹（health 竖切实测）。HTTP 状态/方法语义凭 `openapi` meta 承载，
 * 且须同时挂到 contract（路由注册）与 server procedure（`ImplementInterceptor` 从此读 `successStatus`
 * 落响应码·见 `@saas/api-contract` posts 契约单源）。
 */
@Controller()
@UseGuards(TenantIsolationGuard)
export class PostsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  /**
   * 列出当前组织下的帖子（游标分页）。
   * @returns 当前组织拥有的帖子游标页。
   */
  @Impl(postsListContract)
  list() {
    return os
      .input(listPostsQuerySchema)
      .output(postCursorPageSchema)
      .meta(postsListMeta)
      .handler(({ input }) =>
        // CursorPage<PostReadModel> 携 readonly items（领域只读形）·此处声明出线投影型 PostCursorPage
        // （与 PostReadModel 字段一一对应）；PII/多余字段仍由 output schema 运行时 strip 兜底（S7b 白名单）。
        this.queryBus.execute<ListPostsQuery, PostCursorPage>(
          new ListPostsQuery(input, input.organizationId),
        ),
      );
  }

  /**
   * 在当前组织下创建帖子。
   * @returns 已落库并盖章当前组织的帖子。
   */
  @Impl(postsCreateContract)
  create() {
    return os
      .input(createPostSchema)
      .output(postViewSchema)
      .meta(postsCreateMeta)
      .handler(({ input }) =>
        this.commandBus.execute<CreatePostCommand, PostReadModel>(
          new CreatePostCommand(input.title, input.content ?? null, input.published),
        ),
      );
  }
}
