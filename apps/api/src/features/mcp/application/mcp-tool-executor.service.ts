import type { VerifiedMcpCredential } from '@app/modules/auth/application/ports/mcp-token-verifier.port';
import { ListTenantDirectoryQuery } from '@app/modules/organizations/application/queries/list-tenant-directory.query';
import type { TenantDirectoryEntry } from '@app/modules/organizations/application/read-models/tenant-directory.read-model';
import { ListPostsQuery } from '@app/modules/posts/application/queries/list-posts.query';
import type { PostReadModel } from '@app/modules/posts/application/read-models/post.read-model';
import type { CursorPage, CursorPageRequest } from '@core/saas-kit/shared-kernel/domain/pagination';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { Inject, Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { McpToolName } from './mcp-tool-registry';

/** MCP 工具文本回执（对齐 SDK `CallToolResult.content` 可变形状·不引 SDK 类型）。 @public */
export type McpToolResult = {
  content: { type: 'text'; text: string }[];
};

/** `posts.list` 入参（MCP 面自有形·语义对齐 HTTP `listPostsQuerySchema`）。 @public */
export interface PostsListArgs {
  readonly cursor?: string;
  readonly limit?: number;
}

/** 缺省页宽（与 HTTP 面游标查询缺省同趣）。 */
const DEFAULT_POSTS_LIMIT = 20;
/** 页宽硬上限（MCP 面防大页拉爆·Agent 侧翻页廉价）。 */
const MAX_POSTS_LIMIT = 100;

/**
 * MCP 工具执行壳（module-mcp-agent-surface 切片 2·一律委托既有 CQRS 查询，零逻辑第二套判据）。
 *
 * @remarks
 * 授权口径**对齐各工具 HTTP 面实际挂载的守卫**（立项稿 §2.2「不复制判据」的落点）：
 *  - `tenant.directory` = `GET /tenants` 同款——会话面 `SessionGuard`+成员资格收敛；本面以凭证
 *    盖章 `userId` 收敛（可见性单源在仓储，非独立隔离闸）；
 *  - `posts.list` = `GET /posts` 同款——仅 `TenantIsolationGuard`（活动租户 fail-closed），HTTP 面
 *    **未声明 `@Can`**（`Post` 不在授权词汇表），故本面不硬挂 `PermissionChecker`——挂了即造第二套
 *    判据且词汇表外 subject 恒拒。写工具（`workspace.create`·HTTP 面有 `@Can('create','Workspace')`）
 *    回归时按其 HTTP 面对称接 `PERMISSION_CHECKER.can`，扩展点即本方法入口的守卫等价段。
 * scope 闸（`selectToolNames`）在 server 注册侧已把不可见工具剔离调用面（deny-by-default），
 * 此处为第二道：即便 handler 被触达，租户轴仍锚 ALS（网关 `run(ctx)` 绑定）fail-closed。
 */
@Injectable()
export class McpToolExecutorService {
  constructor(
    @Inject(QueryBus) private readonly queryBus: QueryBus,
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
  ) {}

  /**
   * 执行一个 MCP 工具调用：按工具名派发既有查询，结果序列化为文本回执。
   *
   * @param tool - 工具名（注册表值域·网关已按 scope 筛过）。
   * @param credential - 已校验的凭证视图（`userId` 可信·租户轴已绑 ALS）。
   * @param args - 工具入参（SDK 侧已按 inputSchema 校验，此处只做宽松映射）。
   * @returns 文本内容回执。
   */
  async execute(
    tool: McpToolName,
    credential: VerifiedMcpCredential,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    switch (tool) {
      case 'tenant.directory': {
        const entries = await this.queryBus.execute<
          ListTenantDirectoryQuery,
          TenantDirectoryEntry[]
        >(new ListTenantDirectoryQuery(credential.userId));
        return this.text(JSON.stringify(entries));
      }
      case 'posts.list': {
        // 等价 TenantIsolationGuard 的 fail-closed：无活动租户（网关未绑 ALS）即拒，绝不裸查。
        this.tenant.requireActiveTenantId();
        const page = await this.queryBus.execute<ListPostsQuery, CursorPage<PostReadModel>>(
          new ListPostsQuery(this.toCursorRequest(args)),
        );
        return this.text(JSON.stringify(page));
      }
    }
  }

  /** `PostsListArgs` → `CursorPageRequest`：limit 缺省 20、值域 [1,100] 收敛；cursor 透传。 */
  private toCursorRequest(args: Record<string, unknown>): CursorPageRequest {
    const raw = (args as PostsListArgs) ?? {};
    const limit =
      typeof raw.limit === 'number' && Number.isInteger(raw.limit)
        ? Math.min(Math.max(raw.limit, 1), MAX_POSTS_LIMIT)
        : DEFAULT_POSTS_LIMIT;
    const cursor = typeof raw.cursor === 'string' ? raw.cursor : undefined;
    return cursor === undefined ? { limit } : { limit, cursor };
  }

  private text(payload: string): McpToolResult {
    return { content: [{ type: 'text', text: payload }] };
  }
}
