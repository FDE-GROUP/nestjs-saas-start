import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import { Controller, HttpStatus, Inject, UseGuards } from '@nestjs/common';
import { Impl } from '@orpc/nest';
import { openapi } from '@orpc/openapi';
import {
  mcpCredentialListSchema,
  mcpCredentialRevokeInputSchema,
  mintedMcpCredentialSchema,
  mintMcpCredentialSchema,
} from '@saas/contracts/index';
import { oc, os } from '../../../common/orpc/orpc';
import { requireSessionUser } from '../../../common/orpc/orpc-context';
import { McpCredentialService } from '../application/mcp-credential.service';

/**
 * MCP 凭证管理面 HTTP 端点（`/api/v1/mcp/credentials`·module-mcp-agent-surface 切片 1）。
 *
 * @remarks
 * 会话墙：全局 `APP_GUARD` SessionGuard 覆盖（deny-by-default，浏览器会话内操作）；
 * 租轴墙：路由级显式 `TenantIsolationGuard`（与 workspaces 同形·fail-closed 无活动租 403，
 * 接线对拍由同区 guard-wiring 测承担——矩阵硬编码清单属 modules 面，A 面隔离闸禁其
 * import features，见立项稿执行留痕），属主=当前会话用户（`userId` 取自可信会话，
 * 无 body 伪造面），租轴另由 `MCP_ACCESS_TOKEN_STORE` 实现侧 ALS fail-closed 盖章（二道）。
 * 序列化白名单：旧 `@SerializeOptions({schema})` 换落点 procedure 级 `.output`（zod 单源不变·
 * 行视图之外的字段（哈希/租户列）结构性不出线）。
 *
 * 换轨 WP-C：三条路由转 per-method `@Impl`（薄壳委托 `McpCredentialService`）——class 级
 * `@UseGuards(TenantIsolationGuard)` 原生保留（守卫墙不弱化）；`@CurrentUser()` 换 `context.user`。
 * 本面属 feature 契约例外（退出公共 openapi·tooling §3 同 odoo-rpc 先例·契约单源仍 `@saas/contracts`），
 * 旧 `@ApiExcludeController` 随 WP-F 退役 openapi:drift 而消解。
 */
const mcpMintMeta = openapi({
  method: 'POST',
  path: '/',
  successStatus: HttpStatus.CREATED,
  summary: '铸造 MCP 凭证（明文一次性回显）',
});
const mcpListMeta = openapi({
  method: 'GET',
  path: '/',
  summary: 'MCP 凭证列表（本人·白名单行视图）',
});
const mcpRevokeMeta = openapi({
  method: 'DELETE',
  path: '/:id',
  successStatus: HttpStatus.NO_CONTENT,
  summary: '撤销 MCP 凭证',
});

export const mcpMintContract = oc
  .input(mintMcpCredentialSchema)
  .output(mintedMcpCredentialSchema)
  .meta(mcpMintMeta);
export const mcpListContract = oc.output(mcpCredentialListSchema).meta(mcpListMeta);
export const mcpRevokeContract = oc.input(mcpCredentialRevokeInputSchema).meta(mcpRevokeMeta);

@Controller('mcp/credentials')
@UseGuards(TenantIsolationGuard)
export class McpCredentialsController {
  constructor(@Inject(McpCredentialService) private readonly service: McpCredentialService) {}

  /** 铸造凭证（明文 token 仅此响应一次性回显）。 */
  @Impl(mcpMintContract)
  mint() {
    return os
      .input(mintMcpCredentialSchema)
      .output(mintedMcpCredentialSchema)
      .meta(mcpMintMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        return this.service.mint(input, user.id);
      });
  }

  /** 本人凭证列表（不含任何可复原明文字段）。 */
  @Impl(mcpListContract)
  list() {
    return os
      .output(mcpCredentialListSchema)
      .meta(mcpListMeta)
      .handler(async ({ context }) => {
        const user = requireSessionUser(context);
        return this.service.list(user.id);
      });
  }

  /** 撤销（幂等；不可见即 404·存在性零泄露·经 WP-D 承接）。 */
  @Impl(mcpRevokeContract)
  revoke() {
    return os
      .input(mcpCredentialRevokeInputSchema)
      .meta(mcpRevokeMeta)
      .handler(async ({ input, context }) => {
        const user = requireSessionUser(context);
        await this.service.revoke(user.id, input.id);
      });
  }
}
