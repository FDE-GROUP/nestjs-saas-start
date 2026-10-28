import { Public } from '@core/saas-kit/tenant-isolation/public.decorator';
import { Controller, Delete, Inject, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { McpAgentSurfaceService } from '../application/mcp-agent-surface.service';

/**
 * `/mcp` MCP 消费面（module-mcp-agent-surface 切片 2·Streamable HTTP 端点）。
 *
 * @remarks
 * 实际路径 = 全局前缀 + 版本 + `mcp`（默认 `/api/v1/mcp`）。薄控制器：`@Res()` 接管（绕全局
 * `TransformInterceptor` 信封·沿 oauth-sso 先例），全权交 `McpAgentSurfaceService`——验凭证、
 * 角色解析、ALS 绑定、会话路由都在服务内（可单测面）。
 * `@Public()` 豁免全局三墙（SessionGuard/CsrfOriginGuard/TenantIsolationGuard）：本面是
 * **bearer 服务凭证**消费面（无浏览器会话），身份与租户轴由 `MCP_TOKEN_VERIFIER` 盖章行单源
 * 自验（签名校验类入站回调同模·`@Public()` 逐处留审）。GET（服务端主动通知通道）在
 * `enableJsonResponse` 形下未启用，只开 POST/DELETE。
 * @public
 */
@Public()
@Controller('mcp')
export class McpController {
  constructor(@Inject(McpAgentSurfaceService) private readonly surface: McpAgentSurfaceService) {}

  /**
   * JSON-RPC 入口（initialize / 后续帧均经此）。
   * @param req - Fastify 请求（header 与已解析 body 由服务侧消费）。
   * @param res - Fastify 回复（hijack 后交 transport 直写原生响应）。
   */
  @Post()
  async post(@Req() req: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    await this.surface.handlePost(req, res);
  }

  /**
   * 会话终止（MCP 会话生命周期收尾）。
   * @param req - Fastify 请求。
   * @param res - Fastify 回复。
   */
  @Delete()
  async remove(@Req() req: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    await this.surface.handleDelete(req, res);
  }
}
