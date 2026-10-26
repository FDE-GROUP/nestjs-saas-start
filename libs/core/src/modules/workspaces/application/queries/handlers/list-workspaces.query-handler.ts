import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  PERMISSION_CHECKER,
  type PermissionChecker,
} from '../../../../../authorization/permission.port';
import type { Page } from '../../../../../shared-kernel/domain/pagination';
import { createPage } from '../../../../../shared-kernel/domain/pagination';
import { TenantIsolationService } from '../../../../../tenant-isolation/tenant-isolation.service';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from '../../../domain/repositories/workspace.repository';
import type { WorkspaceReadModel } from '../../read-models/workspace.read-model';
import { ListWorkspacesQuery } from '../list-workspaces.query';

/**
 * workspace 列表读侧处理器（仓储端口租户卡点 + handler 侧实例级收窄）。
 *
 * @remarks
 * Read side goes through the repository port, which enforces the tenant scope
 * (global-tenancy §9.3 / FR-5). 租户隔离（主轴 tenantId·rehierarchy 切片 C 换轴）仍由仓储适配层唯一卡点保证；
 * 本 handler 只在其上叠加 **instance 级收窄**（module-rbac-query-level-filtering 切片 C·人裁③⑤）：
 * 携 ALS `{tenantId, role, userId}` 向 `PERMISSION_CHECKER` 取 `listPredicate`，
 * `all`→不下推（现状）/ `where`→下推 port / `none`→短路空页不触库（fail-closed·绝不回退全量）。
 * 行为注记（已审）：无租户上下文时由旧「仓储层 403」改「空页」——护栏面仍系上游双守卫，
 * 生产入口不可达该分支，列表面只收窄可见性。
 *
 * @public
 */
@QueryHandler(ListWorkspacesQuery)
export class ListWorkspacesQueryHandler implements IQueryHandler<ListWorkspacesQuery> {
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepository,
    @Inject(PERMISSION_CHECKER) private readonly checker: PermissionChecker,
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
  ) {}

  /**
   * 取实例授权谓词后按 all/where/none 下推或短路空页。
   *
   * @param query - 待执行的列表查询（分页请求）
   * @returns 分页信封（none 或无租户 → 空页）
   */
  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ListWorkspacesQuery): Promise<Page<WorkspaceReadModel>> {
    const predicate = await this.checker.listPredicate({
      tenantId: this.tenant.tenantId,
      role: this.tenant.role,
      userId: this.tenant.userId,
      action: 'read',
      subject: 'Workspace',
    });
    if (predicate.kind === 'none') {
      return createPage<WorkspaceReadModel>([], 0, query.request);
    }
    const authorizationWhere = predicate.kind === 'where' ? predicate.where : undefined;
    return this.workspaces.list(query.request, authorizationWhere) as Promise<
      Page<WorkspaceReadModel>
    >;
  }
}
