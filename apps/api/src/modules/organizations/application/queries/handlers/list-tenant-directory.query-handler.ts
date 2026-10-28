import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  TENANT_DIRECTORY_REPOSITORY,
  type TenantDirectoryRepository,
} from '../../../domain/repositories/tenant-directory.repository';
import type { TenantDirectoryEntry } from '../../read-models/tenant-directory.read-model';
import { ListTenantDirectoryQuery } from '../list-tenant-directory.query';

/**
 * 租户目录用户级读查询处理器（mcp 切片 2 B 面倒置·委派目录端口）。
 *
 * @remarks
 * 与 `TenantsController.list` 同判据单源（同一仓储端口·同一 `userId` 收敛），零第二套逻辑；
 * 本 handler 租户无关——可见面归属由仓储以成员资格收敛，非独立隔离闸。
 * @public
 */
@QueryHandler(ListTenantDirectoryQuery)
export class ListTenantDirectoryQueryHandler
  implements IQueryHandler<ListTenantDirectoryQuery, TenantDirectoryEntry[]>
{
  constructor(
    @Inject(TENANT_DIRECTORY_REPOSITORY) private readonly directory: TenantDirectoryRepository,
  ) {}

  /**
   * 委派目录端口列当前用户可见的租户目录。
   * @param query - 携 `userId`（已验身份）的查询。
   * @returns 归组后的租户条目数组（无成员资格即空数组）。
   */
  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ListTenantDirectoryQuery): Promise<TenantDirectoryEntry[]> {
    return this.directory.listForUser(query.userId);
  }
}
