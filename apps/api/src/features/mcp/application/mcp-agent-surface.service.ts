import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
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
import type { McpToolResult } from './mcp-tool-executor.service';
import { McpToolExecutorService } from './mcp-tool-executor.service';
import { MCP_TOOLS, type McpToolName, selectToolNames } from './mcp-tool-registry';

/** JSON-RPC 单帧/批帧的宽松形状（只辨 initialize 判定，协议细节交 SDK transport）。 */
type RpcBody = { method?: string } | { method?: string }[] | undefined;

/** 会话表条目：transport 本体 + 建会话凭证的租户轴（跨租 sessionId 冒用防线）。 */
interface McpSession {
  transport: StreamableHTTPServerTransport;
  tenantId: string;
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
 * 会话安全：条目记建会话租户；后续请求凭证租户与条目不符 → 视作无会话（400·sessionId 不可
 * 跨租冒用）。HTTP 面 GET（服务端主动通知通道）在 `enableJsonResponse` 形下未启用，只开 POST/DELETE。
 */
@Injectable()
export class McpAgentSurfaceService {
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
      this.writeThrowable(res, err);
      return;
    }
    const ctx = await this.buildScope(cred);
    if (!ctx) {
      res.writeHead(403, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          statusCode: 403,
          errorCode: ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT,
          message: 'No active tenant membership for MCP credential',
        }),
      );
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
      this.writeThrowable(res, err);
      return;
    }
    const sessionId = this.sessionIdOf(req);
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session || session.tenantId !== cred.tenantId) {
      res.writeHead(404).end();
      return;
    }
    try {
      await session.transport.handleRequest(req.raw, res);
    } catch (err) {
      this.logger.warn(`mcp session terminate failed: ${String(err)}`);
      if (!res.headersSent) res.writeHead(500).end();
    }
  }

  /** 会话路由（ALS 窗内）：复用或初始化，随后交 transport 处理本帧。 */
  private async dispatchPost(
    req: FastifyRequest,
    res: ServerResponse,
    cred: VerifiedMcpCredential,
  ): Promise<void> {
    const sessionId = this.sessionIdOf(req);
    const stored = sessionId ? this.sessions.get(sessionId) : undefined;
    const body = req.body as RpcBody;
    const firstFrame = Array.isArray(body) ? body[0] : body;

    if (stored && stored.tenantId === cred.tenantId) {
      await this.process(stored.transport, req, res, body);
      return;
    }
    // 他租 sessionId（或缺头非 initialize）→ 一律视作无会话：400，绝不透露该 id 是否存在。
    // 不带 MCP:CREDENTIAL_* 码——凭证本身可能完全有效，败因只在会话面（防误导诊断）。
    if (firstFrame?.method !== 'initialize') {
      res.writeHead(400, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          statusCode: 400,
          message: 'No valid MCP session',
        }),
      );
      return;
    }

    let transport: StreamableHTTPServerTransport;
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sid: string) => {
        this.sessions.set(sid, { transport, tenantId: cred.tenantId });
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
      if (!res.headersSent) res.writeHead(500).end();
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

  /** 验凭证失败的响应：`HttpException` 原样状态+体（防探测文案单源在 verifier，不在此改写）。 */
  private writeThrowable(res: ServerResponse, err: unknown): void {
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const body = err.getResponse();
      const payload =
        body && typeof body === 'object' ? body : { statusCode: status, message: err.message };
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
      return;
    }
    this.logger.warn(`mcp surface unexpected error: ${String(err)}`);
    if (!res.headersSent) res.writeHead(500).end();
  }
}
