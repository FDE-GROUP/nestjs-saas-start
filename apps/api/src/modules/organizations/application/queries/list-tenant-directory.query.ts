import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { TenantDirectoryEntry } from '../read-models/tenant-directory.read-model';

/**
 * 租户目录用户级读查询（rehierarchy 切片 E-F 读面的 CQRS 出口·mcp 切片 2 B 面倒置）。
 *
 * @remarks
 * 与 `GET /tenants` 同一判据单源：可见面由仓储以 `userId` 成员资格收敛（非独立隔离闸）。
 * `userId` 为**入参显式携带**（消费面已验身份：会话 or MCP 凭证盖章行），本查询不做二次认证。
 * @public
 */
export class ListTenantDirectoryQuery extends BaseQuery<TenantDirectoryEntry[]> {
  constructor(readonly userId: string) {
    super();
  }
}
