import { createHash, randomBytes } from 'node:crypto';
import {
  MCP_ACCESS_TOKEN_STORE,
  type McpAccessTokenStore,
} from '@app/modules/auth/application/ports/mcp-access-token-store.port';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type {
  McpCredentialList,
  MintedMcpCredential,
  MintMcpCredential,
} from '@saas/contracts/index';

/**
 * 凭证明文形态：`mcp_` + 32 字节 hex（128 bit 熵·查找走 sha256 哈希，明文永不落库）。
 * @internal
 */
const TOKEN_PREFIX = 'mcp_';

/** 缺省有效期（ mint 未选 `expiresInDays` 时钉定·策略单源）。 @internal */
const DEFAULT_TTL_DAYS = 90;

/**
 * MCP 凭证编排服务（features/mcp application 层·module-mcp-agent-surface 切片 1）。
 *
 * @remarks
 * 职责 = 明文生成/哈希 + TTL 策略 + 属主收窄；持久化一律经 `MCP_ACCESS_TOKEN_STORE` 端口落
 * auth 属主（实体归位裁定·PIPL/AUTH_USER_STORE 同型），本服务不触 entity/em。
 * scope 与会话角色可达面的**交集收窄**在凭证消费面（切片 2 执行链）实施——mint 只记授权上界，
 * 提权面（如 read 凭证请求 write 工具）在执行点结构性拒绝（deny-by-default·立项稿 §2.1-3）。
 */
@Injectable()
export class McpCredentialService {
  constructor(@Inject(MCP_ACCESS_TOKEN_STORE) private readonly store: McpAccessTokenStore) {}

  /** 铸造凭证：明文仅此返回一次（一次性回显·丢失即轮换）。 */
  async mint(input: MintMcpCredential, userId: string): Promise<MintedMcpCredential> {
    const token = `${TOKEN_PREFIX}${randomBytes(32).toString('hex')}`;
    const row = await this.store.create({
      userId,
      name: input.name,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      // 16 字符前缀含算法位：辨认够用，熵不足不可复原（非秘密定位符）。
      tokenPrefix: token.slice(0, TOKEN_PREFIX.length + 8),
      scopes: input.scopes,
      expiresAt: addDays(new Date(), input.expiresInDays ?? DEFAULT_TTL_DAYS),
    });
    return { ...toRowView(row), token };
  }

  /** 活动租户内本人凭证列表（序列化白名单兜底：行视图剥除哈希/租户列）。 */
  async list(userId: string): Promise<McpCredentialList> {
    const rows = await this.store.listByOwner(userId);
    return { items: rows.map(toRowView) };
  }

  /** 撤销（幂等；不可见/非本人/跨租皆 404——存在性零泄露）。 */
  async revoke(userId: string, id: string): Promise<void> {
    const hit = await this.store.revoke(userId, id);
    if (!hit) {
      throw new HttpException(
        {
          errorCode: ERROR_CODES.MCP_CREDENTIAL_NOT_FOUND,
          message: ERROR_CODES.MCP_CREDENTIAL_NOT_FOUND,
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }
}

/** 行视图映射（entity 行 → 契约行：显式列清单，tokenHash/tenantId 结构性不出面）。 */
function toRowView(row: {
  id: string;
  name: string;
  scopes: string[];
  tokenPrefix: string;
  expiresAt: Date;
  lastUsedAt?: Date | null;
  revokedAt?: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    tokenPrefix: row.tokenPrefix,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt ?? null,
    revokedAt: row.revokedAt ?? null,
    createdAt: row.createdAt,
  };
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}
