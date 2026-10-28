import { CurrentUser } from '@app/modules/auth/api/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SerializeOptions } from '@nestjs/common/serializer/index.js';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type McpCredentialList,
  type MintedMcpCredential,
  type MintMcpCredential,
  mcpCredentialIdParamSchema,
  mcpCredentialListSchema,
  mintedMcpCredentialSchema,
  mintMcpCredentialSchema,
} from '@saas/contracts/index';
import { McpCredentialService } from '../application/mcp-credential.service';

/**
 * MCP 凭证管理面 HTTP 端点（`/api/v1/mcp/credentials`·module-mcp-agent-surface 切片 1）。
 *
 * @remarks
 * 会话墙：全局 `APP_GUARD` SessionGuard 覆盖（deny-by-default，浏览器会话内操作）；
 * 租轴墙：路由级显式 `TenantIsolationGuard`（与 workspaces 同形·fail-closed 无活动租 403，
 * 接线对拍由同区 guard-wiring 测承担——矩阵硬编码清单属 modules 面，A 面隔离闸禁其
 * import features，见立项稿执行留痕），属主=当前会话用户（`userId` 取自可信 `@CurrentUser`，
 * 无 body 伪造面），租轴另由 `MCP_ACCESS_TOKEN_STORE` 实现侧 ALS fail-closed 盖章（二道）。`@ApiExcludeController()`：
 * feature 叠加层契约例外（整控制器退出公共 openapi.yaml·tooling §3 同 odoo-rpc 先例）。
 * 序列化走官方 standard-schema 路径（`@SerializeOptions({schema})` 白名单 strip——
 * 行视图之外的字段（哈希/租户列）结构性不出线）。
 */
@ApiTags('mcp')
@ApiExcludeController()
@Controller('mcp/credentials')
@UseGuards(TenantIsolationGuard)
export class McpCredentialsController {
  constructor(@Inject(McpCredentialService) private readonly service: McpCredentialService) {}

  /** 铸造凭证（明文 token 仅此响应一次性回显）。 */
  @Post()
  @HttpCode(201)
  @SerializeOptions({ schema: mintedMcpCredentialSchema })
  @ApiOperation({ summary: '铸造 MCP 凭证（明文一次性回显）' })
  mint(
    @Body({ schema: mintMcpCredentialSchema }) body: MintMcpCredential,
    @CurrentUser() user: SessionUser,
  ): Promise<MintedMcpCredential> {
    return this.service.mint(body, user.id);
  }

  /** 本人凭证列表（不含任何可复原明文字段）。 */
  @Get()
  @SerializeOptions({ schema: mcpCredentialListSchema })
  @ApiOperation({ summary: 'MCP 凭证列表（本人·白名单行视图）' })
  list(@CurrentUser() user: SessionUser): Promise<McpCredentialList> {
    return this.service.list(user.id);
  }

  /** 撤销（幂等；不可见即 404·存在性零泄露）。 */
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '撤销 MCP 凭证' })
  revoke(
    @Param('id', { schema: mcpCredentialIdParamSchema }) id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<void> {
    return this.service.revoke(user.id, id);
  }
}
