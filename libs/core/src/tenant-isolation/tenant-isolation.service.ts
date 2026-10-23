import { ForbiddenException, Injectable } from '@nestjs/common';
import type { OrganizationRole } from '../authorization/tenant-rules';
import { ERROR_CODES } from '../shared-kernel/errors/error-codes';
import { type TenantIsolationScope, tenantIsolationStorage } from './tenant-isolation-scope';

/**
 * Accessor for the current request's tenant scope. Backed by AsyncLocalStorage so a
 * singleton can read the per-request store without request-scoping every consumer
 * (global-tenancy §9.3 / FR-2).
 *
 * S0 only exposes read access; the fail-closed enforcement guard (FR-5) lands in S2.
 */
@Injectable()
export class TenantIsolationService {
  /** Current tenant context, or undefined outside a resolved request scope. */
  get(): TenantIsolationScope | undefined {
    return tenantIsolationStorage.getStore();
  }

  /** Active tenant id (== organization id), or undefined when none is set. */
  get organizationId(): string | undefined {
    return tenantIsolationStorage.getStore()?.organizationId;
  }

  /**
   * Active workspace id (S3 · D2/§9.2), or undefined when the request carries no
   * `x-workspace-id` selector. Optional by design: it only NARROWS reads/writes within
   * the already-trusted tenant; it is never a security boundary on its own.
   */
  get workspaceId(): string | undefined {
    return tenantIsolationStorage.getStore()?.workspaceId;
  }

  /**
   * Active tenant 内的成员角色（module-rbac-casl 丙裁·ALS 预注入）。undefined =
   * 无活动租户/封禁/词汇外角色——TenantPermissionGuard 据此 fail-closed。
   */
  get role(): OrganizationRole | undefined {
    return tenantIsolationStorage.getStore()?.role;
  }

  /**
   * 当前会话用户 id（module-rbac-query-level-filtering 切片 C·ALS 预注入字段补读取面）。
   * undefined = 未解析出会话——`listPredicate` 的 `{{userId}}` 模板解析输入，缺省时
   * 转换器留字面模板 = DB 匹配落空（保守 deny·与 check 级同向）。
   */
  get userId(): string | undefined {
    return tenantIsolationStorage.getStore()?.userId;
  }

  /** Run `fn` within the given tenant context (used by the middleware / tests). */
  run<T>(ctx: TenantIsolationScope, fn: () => T): T {
    return tenantIsolationStorage.run(ctx, fn);
  }

  /** Fail-closed: require an active tenant, else 403. For tenant-scoped endpoints. */
  requireActiveOrganizationId(): string {
    const organizationId = tenantIsolationStorage.getStore()?.organizationId;
    if (!organizationId)
      throw new ForbiddenException('Missing active organization context', {
        errorCode: ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT,
      });
    return organizationId;
  }
}
