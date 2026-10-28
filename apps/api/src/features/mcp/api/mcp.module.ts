import { MCP_TOKEN_VERIFIER } from '@app/modules/auth/application/ports/mcp-token-verifier.port';
import { Module } from '@nestjs/common';
import { McpCredentialService } from '../application/mcp-credential.service';
import { McpTokenVerifierService } from '../application/mcp-token-verifier.service';
import { McpCredentialsController } from './mcp-credentials.controller';

/**
 * MCP Agent 工具面 feature 模块（module-mcp-agent-surface·装配经 `feature-loader.ts` OVERLAYS 登记）。
 *
 * @remarks
 * 本模块只住编排面（application/api）；凭证实体与持久化端口实现归 **auth 属主上下文**
 * （实体归位裁定）——`MCP_ACCESS_TOKEN_STORE` 由 global `AuthModule` 提供，此处直注零 import。
 * 校验中间件（消费面 `MCP_TOKEN_VERIFIER`）同经 token 注册：实现驻本模块 application，
 * token/形状端口居 auth 公开面——属主侧 e2e 零 features 路径即可消费（隔离闸 A/B 双向合规）。
 */
@Module({
  controllers: [McpCredentialsController],
  providers: [
    McpCredentialService,
    { provide: MCP_TOKEN_VERIFIER, useClass: McpTokenVerifierService },
  ],
  exports: [MCP_TOKEN_VERIFIER],
})
export class McpModule {}
