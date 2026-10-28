import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { McpAccessToken } from '@app/modules/auth/infrastructure/entities/mcp-access-token.entity';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { QueryOrder } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type {
  McpAccessTokenMintInput,
  McpAccessTokenRecord,
  McpAccessTokenStore,
} from '../application/ports/mcp-access-token-store.port';

/**
 * `MCP_ACCESS_TOKEN_STORE` 的 MikroORM 属主侧实现（auth 上下文·切片 1）。
 *
 * @remarks
 * 隔离律沿 posts 仓储同型：`tenantId` 从可信 ALS 经 `requireActiveTenantId()` **fail-closed**
 * 解析且先于任何 DB 访问（无租户→403 绝不查库）；mint 由本侧盖章，调用面（features/mcp）
 * 无租户参数可伪造。读写各 `fork()` 独立 em（禁共享）。`revokedAt` 软位撤销 = 租内+属主
 * 双界 UPDATE，重复撤销命中 0 行仍幂等（列表读回已撤态）。
 */
@Injectable()
export class MikroMcpAccessTokenStoreAdapter implements McpAccessTokenStore {
  constructor(
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
  ) {}

  /** 可信租轴（fail-closed·先于 em）。 */
  private activeTenantId(): string {
    return this.tenant.requireActiveTenantId();
  }

  async create(input: McpAccessTokenMintInput): Promise<McpAccessToken> {
    const tenantId = this.activeTenantId();
    const now = new Date();
    const em = await this.mikro.fork();
    const row = em.create(McpAccessToken, {
      id: uuidv7(),
      tenantId,
      userId: input.userId,
      name: input.name,
      tokenHash: input.tokenHash,
      tokenPrefix: input.tokenPrefix,
      scopes: input.scopes,
      expiresAt: input.expiresAt,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await em.persist(row).flush();
    return row;
  }

  async listByOwner(userId: string): Promise<McpAccessToken[]> {
    const tenantId = this.activeTenantId();
    const em = await this.mikro.fork();
    // 双谓词：隔离主轴 tenantId（去之即回归红）+ 属主收窄（同租他人凭证不可列）。
    return em.find(McpAccessToken, { tenantId, userId } as never, {
      orderBy: { createdAt: QueryOrder.DESC },
    });
  }

  async revoke(userId: string, id: string): Promise<boolean> {
    const tenantId = this.activeTenantId();
    const em = await this.mikro.fork();
    const row = await em.findOne(McpAccessToken, { id, tenantId, userId } as never);
    if (!row) return false;
    if (row.revokedAt) return true; // 幂等：已撤再撤视为成功（零写）。
    em.assign(row, { revokedAt: new Date(), updatedAt: new Date() });
    await em.flush();
    return true;
  }

  async findByHash(tokenHash: string): Promise<McpAccessTokenRecord | null> {
    // 消费面校验时 ALS 尚无租户上下文（bearer 面自证身份前不绑租轴）——scoped:false 全租单行查
    // 是唯一可行形；唯一索引命中后安全由行自带盖章 tenantId 承担（调用侧零参数可伪造）。
    const em = await this.mikro.fork({ scoped: false });
    const row = await em.findOne(McpAccessToken, { tokenHash } as never);
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenantId,
      userId: row.userId,
      name: row.name,
      scopes: row.scopes,
      // 列物理 NOT NULL；`as never` 泛参宽化使 Mikro 返回形带 null/undefined 漂移，此处窄化回真形。
      expiresAt: row.expiresAt as Date,
      lastUsedAt: row.lastUsedAt ?? null,
      revokedAt: row.revokedAt ?? null,
    };
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    // 写表面属主闸：mcpAccessToken ∈ auth owned（table-ownership 机读律）；无租上下文面走
    // scoped:false + 按 id 单行窄写（id 源于 findByHash 已验行，非调用侧输入）。
    const em = await this.mikro.fork({ scoped: false });
    await em.nativeUpdate(McpAccessToken, { id } as never, { lastUsedAt: at });
  }
}
