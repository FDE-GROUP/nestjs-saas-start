import { ForbiddenException, Injectable } from '@nestjs/common';
import type { OrganizationRole } from '../authorization/authorization-rules';
import { ERROR_CODES } from '../shared-kernel/errors/error-codes';
import { type TenantIsolationScope, tenantIsolationStorage } from './tenant-isolation-scope';

/**
 * 当前请求租户作用域的读取器（ALS 支撑·单例免请求作用域化）。
 *
 * @remarks
 * Accessor for the current request's tenant scope. Backed by AsyncLocalStorage so a
 * singleton can read the per-request store without request-scoping every consumer
 * (global-tenancy §9.3 / FR-2).
 *
 * S0 only exposes read access; the fail-closed enforcement guard (FR-5) lands in S2.
 *
 * @public
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
   * 活动工作区 id（S3 · D2/§9.2）；请求未携 `x-workspace-id` 选择器时为 undefined。
   * 设计上为可选：它只在**已受信租户**内收窄读/写，本身从不作为独立安全边界。
   */
  get workspaceId(): string | undefined {
    return tenantIsolationStorage.getStore()?.workspaceId;
  }

  /**
   * Active tenant 内的成员角色（module-rbac-casl 丙裁·ALS 预注入）。undefined =
   * 无活动租户/封禁/词汇外角色——AuthorizationGuard 据此 fail-closed。
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

  /**
   * 在给定租户上下文内运行 `fn`（供中间件 / 测试使用）。
   *
   * @param ctx - 待绑定的租户作用域
   * @param fn - 在该作用域内执行的函数
   * @returns `fn` 的结果
   */
  run<T>(ctx: TenantIsolationScope, fn: () => T): T {
    return tenantIsolationStorage.run(ctx, fn);
  }

  /**
   * fail-closed：要求存在活动租户，否则 403。用于租户作用域端点。
   *
   * @returns 活动租户 id；无则抛 `ForbiddenException`
   *
   * @throws {ForbiddenException} 缺少活动租户上下文时（fail-closed）。
   */
  requireActiveOrganizationId(): string {
    const organizationId = tenantIsolationStorage.getStore()?.organizationId;
    if (!organizationId)
      throw new ForbiddenException('Missing active organization context', {
        errorCode: ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT,
      });
    return organizationId;
  }
}
