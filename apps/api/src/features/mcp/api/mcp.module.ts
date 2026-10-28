import { Module } from '@nestjs/common';
import { McpCredentialService } from '../application/mcp-credential.service';
import { McpCredentialsController } from './mcp-credentials.controller';

/**
 * MCP Agent 工具面 feature 模块（module-mcp-agent-surface·装配经 `feature-loader.ts` OVERLAYS 登记）。
 *
 * @remarks
 * 本模块只住编排面（application/api）；凭证实体与持久化端口实现归 **auth 属主上下文**
 * （实体归位裁定）——`MCP_ACCESS_TOKEN_STORE` 由 global `AuthModule` 提供，此处直注零 import。
 * 切片 2 的 `/mcp` 执行面（MCP server 薄壳 + 凭证校验 guard）在本模块 additive 扩展。
 */
@Module({
  controllers: [McpCredentialsController],
  providers: [McpCredentialService],
})
export class McpModule {}
