import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '../shared-kernel/errors/error-codes';
import { TenantIsolationService } from '../tenant-isolation/tenant-isolation.service';
import { CAN_KEY, type CanRequirement } from './can.decorator';
import { TENANT_PERMISSION_CHECKER, type TenantPermissionChecker } from './tenant-permission.port';

/**
 * Enforces tenant-level RBAC for routes annotated with `@Can` (module-rbac-casl §2.2/§2.3 ·
 * global-tenancy §9.3 / FR-4). Applied per-route via `@UseGuards`.
 *
 * Fail-closed: without an active tenant context the request is rejected outright; a guarded
 * route additionally requires the ALS-preset member role (丙裁·会话解析点预注入) — missing
 * role denies. The allow/deny decision itself is delegated to the core-owned
 * `TenantPermissionChecker` port, whose reference-app adapter projects the tenant's DB grant
 * rows (organization_role_grant·module-rbac-dynamic-roles) into a CASL ability. Core imports no
 * auth / CASL impl (§9.5.4①B).
 */
@Injectable()
export class TenantPermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TenantIsolationService) private readonly tenantContext: TenantIsolationService,
    @Inject(TENANT_PERMISSION_CHECKER) private readonly checker: TenantPermissionChecker,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Fail-closed: a tenant-scoped route requires an active tenant (FR-5 seed).
    const organizationId = this.tenantContext.organizationId;
    if (!organizationId) {
      throw new ForbiddenException('No active organization context', {
        errorCode: ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT,
      });
    }

    const requirement = this.reflector.getAllAndOverride<CanRequirement | undefined>(CAN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Authenticated + in-tenant is enough when the route declares no specific capability.
    if (!requirement) return true;

    const role = this.tenantContext.role;
    // S2（module-rbac-dynamic-roles）：规则源 = 租户 DB grant 行，裁决异步（适配内版本缓存·
    // 热路径命中不查库）。organizationId 为规则分区键，同 key 角色跨租互不串形。
    const allowed = await this.checker.can({ organizationId, role, ...requirement });
    if (!allowed) {
      throw new ForbiddenException(
        `Missing tenant permission: ${requirement.action} ${requirement.subject}`,
        { errorCode: ERROR_CODES.TENANCY_PERMISSION_DENIED },
      );
    }
    return true;
  }
}
