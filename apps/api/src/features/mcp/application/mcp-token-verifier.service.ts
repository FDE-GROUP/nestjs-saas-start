import { createHash } from 'node:crypto';
import {
  MCP_ACCESS_TOKEN_STORE,
  type McpAccessTokenStore,
} from '@app/modules/auth/application/ports/mcp-access-token-store.port';
import type {
  McpTokenVerifier,
  VerifiedMcpCredential,
} from '@app/modules/auth/application/ports/mcp-token-verifier.port';
import { TenantStatusService } from '@core/saas-kit/modules/organizations/lifecycle/tenant-status.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { HttpException, Inject, Injectable } from '@nestjs/common';

/**
 * MCP 租级凭证消费面校验（module-mcp-agent-surface 切片 1·校验中间件判据件）。
 *
 * @remarks
 * deny-by-default 全链 fail-closed：
 *  - 不存在 / 已撤销 / 已过期 → **统一 401 `MCP:CREDENTIAL_INVALID`**（同码同案防探测——
 *    外部无法区分「哈希未命中」与「已撤销」，凭证存在性零泄露）；
 *  - 凭证有效但属租被封禁 → 403 `MCP:TENANT_SUSPENDED`（失能联动沿 `TenantStatusService`
 *    单源判据，绝不第二套）；
 *  - 租户上下文 = 签发时盖章的 `row.tenantId` 单源（调用侧零参数可指定·X7 P0 教训的
 *    消费面对偶：「他租凭证」在本面上根本不存在跨租消费路径）。
 * 成功路径 await 刷 `lastUsedAt`，窄写失败吞错不阻断校验主路（可用性优先·审计面非安全闸）。
 * 以 `MCP_TOKEN_VERIFIER` token 经 `McpModule` 注册——属主侧 e2e/消费面经 token 解析，
 * 零 features 路径 import（隔离闸 A/B 双向合规）。
 */
@Injectable()
export class McpTokenVerifierService implements McpTokenVerifier {
  constructor(
    @Inject(MCP_ACCESS_TOKEN_STORE) private readonly store: McpAccessTokenStore,
    @Inject(TenantStatusService) private readonly tenantStatus: TenantStatusService,
  ) {}

  async verify(bearerToken: string): Promise<VerifiedMcpCredential> {
    const token = typeof bearerToken === 'string' ? bearerToken.trim() : '';
    if (!token) throw this.invalid();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const row = await this.store.findByHash(tokenHash);
    if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
      throw this.invalid();
    }
    if (await this.tenantStatus.isBlocked(row.tenantId)) {
      throw new HttpException(
        {
          statusCode: 403,
          errorCode: ERROR_CODES.MCP_TENANT_SUSPENDED,
          message: 'Tenant is not active for MCP credential use',
        },
        403,
      );
    }
    const now = new Date();
    await this.store.touchLastUsed(row.id, now).catch(() => undefined);
    return {
      credentialId: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      name: row.name,
      scopes: row.scopes,
    };
  }

  /** 三态合一 401（防探测：不区分未命中/已撤/已过期）。 */
  private invalid(): HttpException {
    return new HttpException(
      {
        statusCode: 401,
        errorCode: ERROR_CODES.MCP_CREDENTIAL_INVALID,
        message: 'Invalid MCP credential',
      },
      401,
    );
  }
}
