import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { STATUS_CODES } from 'node:http';
import type {
  McpTokenVerifier,
  VerifiedMcpCredential,
} from '@app/modules/auth/application/ports/mcp-token-verifier.port';
import { MCP_TOKEN_VERIFIER } from '@app/modules/auth/application/ports/mcp-token-verifier.port';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import type { TenantIsolationScope } from '@core/saas-kit/tenant-isolation/tenant-isolation-scope';
import {
  TENANT_SCOPE_RESOLVER,
  type TenantScopeResolver,
} from '@core/saas-kit/tenant-isolation/tenant-scope-resolver.port';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { errorEnvelopeFields } from '../../../common/errors/error-envelope-fields';
import type { McpToolResult } from './mcp-tool-executor.service';
import { McpToolExecutorService } from './mcp-tool-executor.service';
import { MCP_TOOLS, type McpToolName, selectToolNames } from './mcp-tool-registry';

/** JSON-RPC 单帧/批帧的宽松形状（只辨 initialize 判定，协议细节交 SDK transport）。 */
type RpcBody = { method?: string } | { method?: string }[] | undefined;

/** 会话表条目：transport 本体 + 建会话凭证的租户轴（跨租 sessionId 冒用防线）+ 闲置回收轴。 */
interface McpSession {
  transport: StreamableHTTPServerTransport;
  tenantId: string;
  /** 最近一次命中时刻（ms epoch·闲置 TTL 与容量逐出的 LRU 锚）。 */
  lastSeenAt: number;
}

/** 工具展示元数据（描述 + 入参 JSON Schema 的 zod 源·SDK 注册时投影）。 */
interface ToolMeta {
  description: string;
  inputSchema?: Record<string, z.ZodType>;
}

const TOOL_META: Record<McpToolName, ToolMeta> = {
  'tenant.directory': {
    description:
      'List tenants visible to the credential owner, each with its organizations (id/name/slug/status).',
  },
  'posts.list': {
    description: 'List posts within the credential tenant (cursor-paginated).',
    inputSchema: {
      cursor: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  'workspace.create': {
    description:
      'Create a workspace under an organization of the credential tenant. organizationId must be one of the tenant/organization ids returned by tenant.directory.',
    inputSchema: {
      name: z.string().min(1),
      slug: z.string().min(1),
      organizationId: z.string().min(1),
    },
  },
};

/**
 * MCP 消费面会话网关（module-mcp-agent-surface 切片 2·spike 坐实形制的产品化）。
 *
 * @remarks
 * Fastify 5 × SDK `StreamableHTTPServerTransport` **会话形**（spike 两轮失败换来的坐实形·记忆
 * 8f39ba9f）：`reply.hijack()` 后原生 req/res + 已解析 body 交 transport 全权处理 JSON-RPC；
 * initialize POST 建 `McpServer`（工具按凭证 scopes 经 `selectToolNames` 注册——空集零工具，
 * deny-by-default 在**可见面**兑现）+ `StreamableHTTPServerTransport`（`enableJsonResponse`·
 * 会话 id 入表）；后续 POST 按 `mcp-session-id` 头复用。
 *
 * 鉴权链（每 HTTP 请求重验·bearer 消费面无会话）：`MCP_TOKEN_VERIFIER.verify` → 401/403 直落
 * （三态合一防探测单源在 verifier，本面不复制）→ `TENANT_SCOPE_RESOLVER.resolveTenantRole`
 * 证租内成员资格（无分配行 → 403 fail-closed·与中间件同单源）→ `TenantIsolationService.run(ctx)`
 * 程序化合成 ALS（对齐中间件 D7 显式租激活形：租户轴 + userId + role + orgVisibility 顺带读回，
 * **无活动组织轴**）→ `transport.handleRequest`。工具 handler 在同一异步链执行，ALS 天然可达。
 *
 * 错误体（承换轨评审 M3）：本面所有 JSON 错误回执经 `writeError` 统一发射，补齐
 * `@saas/contracts` `errorResponseSchema` 必填字段（`timestamp/path/requestId` 与 REST 过滤器
 * 共享 `errorEnvelopeFields` 单源）；verifier 自带 message/errorCode 原样透传、不改写。
 *
 * 会话安全：条目记建会话租户；后续请求凭证租户与条目不符 → 视作无会话（400·sessionId 不可
 * 跨租冒用）。HTTP 面 GET（服务端主动通知通道）在 `enableJsonResponse` 形下未启用，只开 POST/DELETE。
 *
 * 会话生命周期（承换轨评审 MCP②/M1 的进程内半段）：内存表非无界——闲置超
 * `SESSION_IDLE_TTL_MS` 的条目在任意命中/新建点惰性回收，容量以 `MAX_SESSIONS` 为上限
 * 按 LRU 逐出（被回收/逐出者 transport.close·后续请求同「无会话」口径 400·零新透露）。
 * 多实例共享/横扩所需的外部存储（Redis 触 #2 / 表触 #1）属高危另签件·登记缓后。
 */
@Injectable()
export class McpAgentSurfaceService {
  /** 闲置会话回收阈值（30 分钟无命中即惰性回收·常量单源·不占配置面）。 */
  static readonly SESSION_IDLE_TTL_MS = 30 * 60_000;
  /** 进程内并发会话上限（超出按 LRU 逐出·防无界增长拖倒单例）。 */
  static readonly MAX_SESSIONS = 128;

  private readonly logger = new Logger(McpAgentSurfaceService.name);
  private readonly sessions = new Map<string, McpSession>();

  constructor(
    @Inject(MCP_TOKEN_VERIFIER) private readonly verifier: McpTokenVerifier,
    @Inject(TENANT_SCOPE_RESOLVER) private readonly resolver: TenantScopeResolver,
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
    @Inject(McpToolExecutorService) private readonly executor: McpToolExecutorService,
  ) {}

  /**
   * 消费面存活工具名（仅诊断用·单测断言 scope→可见面映射）。
   * @param scopes - 凭证授权集。
   * @returns 已注册且 scope 命中的工具名。
   */
  visibleTools(scopes: readonly string[]): readonly string[] {
    return MCP_TOOLS.filter((tool) => scopes.includes(tool.requiredScope)).map((tool) => tool.name);
  }

  /** `POST /mcp`：验凭证→解角色→绑 ALS→会话路由→交 transport。 */
  async handlePost(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.hijack();
    const res = reply.raw;
    let cred: VerifiedMcpCredential;
    try {
      cred = await this.verifier.verify(this.bearerOf(req));
    } catch (err) {
      this.writeThrowable(req, res, err);
      return;
    }
    const ctx = await this.buildScope(cred);
    if (!ctx) {
      this.writeError(req, res, 403, {
        errorCode: ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT,
        message: 'No active tenant membership for MCP credential',
      });
      return;
    }
    // ALS 包裹整个 transport 处理窗：工具 handler 在同一异步链执行（enableJsonResponse 下
    // handleRequest await 到响应写毕），读回的租户轴即本次已验凭证。
    await this.tenant.run(ctx, () => this.dispatchPost(req, res, cred));
  }

  /** `DELETE /mcp`：terminate 会话（同样重验 bearer + 租户匹配·不留旁路通道）。 */
  async handleDelete(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.hijack();
    const res = reply.raw;
    let cred: VerifiedMcpCredential;
    try {
      cred = await this.verifier.verify(this.bearerOf(req));
    } catch (err) {
      this.writeThrowable(req, res, err);
      return;
    }
    const sessionId = this.sessionIdOf(req);
    const session = sessionId ? this.lookupSession(sessionId) : undefined;
    if (!session || session.tenantId !== cred.tenantId) {
      this.writeError(req, res, 404, { message: 'No valid MCP session' });
      return;
    }
    session.lastSeenAt = Date.now();
    try {
      await session.transport.handleRequest(req.raw, res);
    } catch (err) {
      this.logger.warn(`mcp session terminate failed: ${String(err)}`);
      this.writeError(req, res, 500);
    }
  }

  /** 会话路由（ALS 窗内）：复用或初始化，随后交 transport 处理本帧。 */
  private async dispatchPost(
    req: FastifyRequest,
    res: ServerResponse,
    cred: VerifiedMcpCredential,
  ): Promise<void> {
    const sessionId = this.sessionIdOf(req);
    const stored = sessionId ? this.lookupSession(sessionId) : undefined;
    const body = req.body as RpcBody;
    const firstFrame = Array.isArray(body) ? body[0] : body;

    if (stored && stored.tenantId === cred.tenantId) {
      stored.lastSeenAt = Date.now();
      await this.process(stored.transport, req, res, body);
      return;
    }
    // 他租 sessionId（或缺头非 initialize）→ 一律视作无会话：400，绝不透露该 id 是否存在。
    // 不带 MCP:CREDENTIAL_* 码——凭证本身可能完全有效，败因只在会话面（防误导诊断）。
    if (firstFrame?.method !== 'initialize') {
      this.writeError(req, res, 400, { message: 'No valid MCP session' });
      return;
    }

    let transport: StreamableHTTPServerTransport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sid: string) => {
        this.registerSession(sid, transport, cred.tenantId);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) this.sessions.delete(transport.sessionId);
    };
    const server = this.buildServer(cred);
    await server.connect(transport);
    await this.process(transport, req, res, body);
  }

  private async process(
    transport: StreamableHTTPServerTransport,
    req: FastifyRequest,
    res: ServerResponse,
    body: RpcBody,
  ): Promise<void> {
    try {
      await transport.handleRequest(req.raw, res, body);
    } catch (err) {
      this.logger.warn(`mcp transport error: ${String(err)}`);
      this.writeError(req, res, 500);
    }
  }

  /** 按凭证 scopes 建本会话专属 server（空集 = 零工具·不可见即不可调）。 */
  private buildServer(cred: VerifiedMcpCredential): McpServer {
    const server = new McpServer({ name: 'saas-agent-surface', version: '0.2.0' });
    for (const name of selectToolNames(cred.scopes)) {
      const meta = TOOL_META[name];
      server.registerTool(
        name,
        { description: meta.description, inputSchema: meta.inputSchema },
        async (args: Record<string, unknown>) => this.runTool(name, cred, args),
      );
    }
    return server;
  }

  /**
   * 工具调用入口：执行器异常折成 `isError` 回执（MCP 语义·调用方可见原因），
   * 绝不把本站错误对象裸抛成协议层断链。
   */
  private async runTool(
    name: McpToolName,
    cred: VerifiedMcpCredential,
    args: Record<string, unknown>,
  ): Promise<McpToolResult & { isError?: boolean }> {
    try {
      return await this.executor.execute(name, cred, args ?? {});
    } catch (err) {
      const text =
        err instanceof HttpException ? `${err.getStatus()} ${err.message}` : `Tool ${name} failed`;
      if (!(err instanceof HttpException)) this.logger.warn(`mcp tool ${name}: ${String(err)}`);
      return { content: [{ type: 'text', text }], isError: true };
    }
  }

  /**
   * 合成请求级租户作用域（对齐中间件 D7 显式租激活形·无活动组织轴）。
   *
   * @remarks
   * 成本取舍留痕（承换轨评审 MCP③）：本面每个 HTTP 请求重验链最多 4 次 DB 往返
   * （verifier 内 findByHash+touchLastUsed，加此处 resolveTenantRole+readOrgVisibility）——
   * 换的是撤销/退租/封禁的即时生效（与会话同生命周期的缓存会开出撤销窗口），不在安全语义上
   * 省钱。若量级坐实热点，降往返（合并查询/短 TTL 只读缓存）属另案待审·不在此自行优化。
   *
   * @returns 绑定成功的 scope；成员资格解不出角色 → `undefined`（调用侧 403 fail-closed）。
   */
  private async buildScope(cred: VerifiedMcpCredential): Promise<TenantIsolationScope | undefined> {
    const role = await this.resolver
      .resolveTenantRole(cred.tenantId, cred.userId)
      .catch((): undefined => undefined);
    if (!role) return undefined;
    const orgVisibility = await this.resolver
      .readOrgVisibility(cred.tenantId)
      .catch((): undefined => undefined);
    return { tenantId: cred.tenantId, userId: cred.userId, role, orgVisibility };
  }

  private bearerOf(req: FastifyRequest): string {
    const header = req.headers.authorization ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match?.[1]?.trim() ?? '';
  }

  private sessionIdOf(req: FastifyRequest): string | undefined {
    const value = req.headers['mcp-session-id'];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  /**
   * 命中读取 + 惰性闲置回收（承评审 MCP②）：过期条目出表并 close transport，
   * 调用侧同「无会话」口径处置（零新透露面）。
   */
  private lookupSession(sessionId: string): McpSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (Date.now() - session.lastSeenAt > McpAgentSurfaceService.SESSION_IDLE_TTL_MS) {
      this.sessions.delete(sessionId);
      this.closeQuietly(session.transport);
      return undefined;
    }
    return session;
  }

  /** 登记新会话：先惰性清过期，仍满则按 LRU 逐出最久未命中者（防无界增长）。 */
  private registerSession(
    sessionId: string,
    transport: StreamableHTTPServerTransport,
    tenantId: string,
  ): void {
    for (const [sid, session] of this.sessions) {
      if (Date.now() - session.lastSeenAt > McpAgentSurfaceService.SESSION_IDLE_TTL_MS) {
        this.sessions.delete(sid);
        this.closeQuietly(session.transport);
      }
    }
    while (this.sessions.size >= McpAgentSurfaceService.MAX_SESSIONS) {
      let oldestId: string | undefined;
      let oldestSeen = Number.POSITIVE_INFINITY;
      for (const [sid, session] of this.sessions) {
        if (session.lastSeenAt < oldestSeen) {
          oldestId = sid;
          oldestSeen = session.lastSeenAt;
        }
      }
      if (oldestId === undefined) break;
      const evicted = this.sessions.get(oldestId);
      this.sessions.delete(oldestId);
      if (evicted) this.closeQuietly(evicted.transport);
      this.logger.warn(`mcp session capacity reached: evicted LRU ${oldestId}`);
    }
    this.sessions.set(sessionId, { transport, tenantId, lastSeenAt: Date.now() });
  }

  /** 回收时尽力关闭 transport（释 SDK 侧资源·失败只警不致断链）。 */
  private closeQuietly(transport: StreamableHTTPServerTransport): void {
    try {
      void transport.close();
    } catch (err) {
      this.logger.warn(`mcp session close failed: ${String(err)}`);
    }
  }

  /**
   * 验凭证失败的响应：`HttpException` 状态+体经 `writeError` 透传补齐（防探测文案单源在
   * verifier，本面不改写其 message/errorCode）；非-HttpException 落通用 500（不泄露原文）。
   */
  private writeThrowable(req: FastifyRequest, res: ServerResponse, err: unknown): void {
    if (err instanceof HttpException) {
      const body = err.getResponse();
      const partial =
        body && typeof body === 'object'
          ? (body as Record<string, unknown>)
          : { message: err.message };
      this.writeError(req, res, err.getStatus(), partial);
      return;
    }
    this.logger.warn(`mcp surface unexpected error: ${String(err)}`);
    this.writeError(req, res, 500);
  }

  /**
   * 本面错误体统一发射（承换轨评审 M3）：补齐 `@saas/contracts` `errorResponseSchema` 必填
   * 字段（`statusCode/message/error/timestamp/path/requestId`），关联三字段与 REST 过滤器共享
   * `errorEnvelopeFields` 单源。`partial` 原样透传异常体自带字段（如 verifier 防探测 message/
   * errorCode），缺省项回落 HTTP reason phrase；`headersSent` 后不再写（transport 接管后归其所有）。
   */
  private writeError(
    req: FastifyRequest,
    res: ServerResponse,
    status: number,
    partial?: Record<string, unknown>,
  ): void {
    if (res.headersSent) return;
    const payload: Record<string, unknown> = {
      statusCode: status,
      message: STATUS_CODES[status] ?? 'Internal server error',
      error: STATUS_CODES[status] ?? 'Internal Server Error',
      ...errorEnvelopeFields(req),
      ...partial,
    };
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
  }
}
