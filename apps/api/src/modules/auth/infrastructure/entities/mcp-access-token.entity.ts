import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../../../database/mikro/column-meta';
import { TENANT_ISOLATION_FILTERS } from '../../../../database/mikro/tenant-isolation-filter';

/**
 * `mcp_access_token` 表列元数据单源 + 运行时扁平实体（module-mcp-agent-surface 切片 1·
 * 实体归位裁定：凭证属 **auth 身份机器族**——与 `consent`/`session` 同域，`table-ownership.ts`
 * 登记 `mcpAccessToken: 'auth'`；features/mcp 编排面经本域仓储写，不落自有实体）。
 *
 * 语义（承立项稿 §2.1-3·X7 P0 防线）：MCP 凭证 = 用户对其会话的**租级有界委托**——
 * 签发时盖 `tenantId`（NOT NULL：凭证只在已定租上下文铸造，无 expand 兼容包袱），
 * `scopes` 运行时与会话角色可达面取交集收窄（deny-by-default，空集即拒）；
 * **明文 token 永不落库**——`tokenHash` 存 sha256 hex（唯一索引=查找键），`tokenPrefix`
 * 仅辨认用（非秘密）。撤销走 `revokedAt` 软位（审计留痕），到期由 `expiresAt` 硬闸。
 * 形态沿 META 双形 γ 立意：`MCP_ACCESS_TOKEN_META` 同供 `buildMigrationEntity`（迁移忠实）
 * 与本运行时实体（消双描述）；租户行级隔离在册（`verify-tenant-scoped-registry` 登记
 * `mcp_access_token`）。⚠ tsx 消费链一律**相对导入**。
 */

export const MCP_ACCESS_TOKEN_META: TableMeta = {
  name: 'McpAccessToken',
  tableName: 'mcp_access_token',
  columns: [
    ['id', { k: 'text', primary: true }],
    // 租级凭证：签发时 ALS 盖章·NOT NULL（无 workspace expand 段的历史包袱·换轴后直落主轴）。
    ['tenantId', { k: 'fk', target: 'Tenant', onDelete: 'cascade' }],
    // 委托主体（属主用户）：随 user 级联删（PIPL 同型——用户消亡凭证不留存）。
    ['userId', { k: 'fk', target: 'User', onDelete: 'cascade' }],
    ['name', { k: 'text' }],
    /** 明文 token 的 sha256 hex（唯一定位键·校验走哈希查表，不可复原明文）。 */
    ['tokenHash', { k: 'text' }],
    /** 明文前缀（辨认用·非秘密，形如 `mcp_Ab12…`）。 */
    ['tokenPrefix', { k: 'text' }],
    /** 授权面词汇（`read|write` 子集·wire 契约 = @saas/contracts `MCP_CREDENTIAL_SCOPES`）。 */
    ['scopes', { k: 'json' }],
    ['expiresAt', { k: 'datetime' }],
    ['lastUsedAt', { k: 'datetime', nullable: true }],
    /** 撤销软位（null=在用；append-only 审计留痕不物理删行·mint 后即不可变除 revoke/lastUsed）。 */
    ['revokedAt', { k: 'datetime', nullable: true }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime' }],
  ],
  // 哈希唯一 = 鉴权查找键（同哈希并发 mint 结构上不可能两行）。
  uniques: [{ name: 'mcp_access_token_hash_idx', properties: ['tokenHash'] }],
  // 读锚双形：租级列表（隔离主轴）+ 属主「我的凭证」面。
  indexes: [
    { name: 'mcp_access_token_tenant_idx', properties: ['tenantId'] },
    { name: 'mcp_access_token_user_idx', properties: ['userId'] },
  ],
  // 行级隔离机制化：在册租户作用域实体（登记表同步 verify-tenant-scoped-registry.ts）。
  filters: TENANT_ISOLATION_FILTERS,
};

export interface McpAccessToken {
  id: string;
  /** 归属租户（签发时盖章·NOT NULL）。 */
  tenantId: string;
  /** 委托主体用户。 */
  userId: string;
  name: string;
  /** sha256 hex（明文永不落库）。 */
  tokenHash: string;
  tokenPrefix: string;
  /** 授权面词汇（`read|write` 子集）。 */
  scopes: string[];
  expiresAt: Date;
  lastUsedAt?: Date | null;
  /** 撤销软位（null=在用）。 */
  revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export const McpAccessToken: EntitySchema<McpAccessToken> = buildRuntimeEntity(
  MCP_ACCESS_TOKEN_META,
) as EntitySchema<McpAccessToken>;
