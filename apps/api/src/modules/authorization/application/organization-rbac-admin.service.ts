import type {
  AuthorizationAction,
  AuthorizationSubject,
} from '@core/saas-kit/authorization/authorization-rules';
import { SYSTEM_ROLE_KEYS } from '@core/saas-kit/authorization/authorization-rules';
import {
  PERMISSION_INVALIDATOR,
  type PermissionInvalidator,
} from '@core/saas-kit/authorization/permission.port';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RoleAssignabilityReader } from '../domain/ports/role-assignability.port';
import {
  ORGANIZATION_RBAC_REPOSITORY,
  type OrganizationRbacRepository,
  type OrganizationRoleGrantView,
  type OrganizationRoleView,
} from '../domain/repositories/organization-rbac.repository';

/**
 * 角色/授权**管理门面应用服务**（module-rbac-dynamic-roles §2.5/§2.6·S3）。
 *
 * 职责边界（授权在我·事实入 DB）：
 *  - 从 ALS 取活动租户（`requireActiveOrganizationId`·fail-closed）与操作者（`userId`·审计 actorId，缺省 null）；
 *  - 委派 `OrganizationRbacRepository`（授权事实 SSOT 的唯一读写通道·写侧先过 domain 策略闸并同通道落审计行）；
 *  - 将端口返回的**领域结果码**转译为 HTTP 语义（领域不借异常表达事实，转译归应用层）；
 *  - **写成功后失效本租户投影缓存**（`PermissionInvalidator`·热改即生效·读写分治端口）。
 *
 * 管理职权本身由 controller `@Can(<动作>, 'Role' | 'RoleGrant')` + CASL 守卫裁决（授权面），
 * 本服务不复权限判定（禁散点特判）；自定义角色对成员的挂载存在性校验见 `isRoleAssignable`。
 */
@Injectable()
export class OrganizationRbacAdminService implements RoleAssignabilityReader {
  constructor(
    @Inject(ORGANIZATION_RBAC_REPOSITORY) private readonly rbac: OrganizationRbacRepository,
    @Inject(PERMISSION_INVALIDATOR)
    private readonly invalidator: PermissionInvalidator,
    @Inject(TenantIsolationService) private readonly ctx: TenantIsolationService,
  ) {}

  /** 本租户全部角色（读面·不触发失效）。 */
  async listRoles(): Promise<OrganizationRoleView[]> {
    return this.rbac.listRoles(this.org());
  }

  /** 某角色的授权行（查无角色 → 404·供管理面回显勾选态）。 */
  async getGrants(roleKey: string): Promise<OrganizationRoleGrantView[]> {
    const grants = await this.rbac.findGrants(this.org(), roleKey);
    if (grants === null) {
      throw new NotFoundException(`Role not found: ${roleKey}`, {
        errorCode: ERROR_CODES.ROLE_NOT_FOUND,
      });
    }
    return grants;
  }

  async createRole(key: string, name: string): Promise<OrganizationRoleView> {
    const org = this.org();
    const result = await this.rbac.createRole(org, key, name, this.actor());
    if (result === 'invalidKey') {
      throw new BadRequestException(`Invalid role key: ${key}`, {
        errorCode: ERROR_CODES.ROLE_INVALID_KEY,
      });
    }
    if (result === 'duplicate') {
      throw new ConflictException(`Role key already exists: ${key}`, {
        errorCode: ERROR_CODES.ROLE_DUPLICATE,
      });
    }
    this.invalidator.invalidate(org);
    const role = await this.rbac.findRole(org, key);
    /* c8 ignore next 3 -- created 后必可查回（同事务已提交），防御性兜底非可达分支 */
    if (!role) {
      throw new NotFoundException(`Role not found after create: ${key}`, {
        errorCode: ERROR_CODES.ROLE_NOT_FOUND,
      });
    }
    return role;
  }

  async renameRole(key: string, name: string): Promise<void> {
    const org = this.org();
    const result = await this.rbac.renameRole(org, key, name, this.actor());
    this.mapMutation(result, key);
    this.invalidator.invalidate(org);
  }

  async deleteRole(key: string): Promise<void> {
    const org = this.org();
    const result = await this.rbac.deleteRole(org, key, this.actor());
    this.mapMutation(result, key);
    this.invalidator.invalidate(org);
  }

  async grant(
    roleKey: string,
    entry: {
      subject: AuthorizationSubject;
      action: AuthorizationAction;
      conditions: Record<string, unknown> | null;
    },
  ): Promise<void> {
    const org = this.org();
    const result = await this.rbac.grant(org, roleKey, entry, this.actor());
    if (result === 'invalidConditions') {
      throw new BadRequestException('Invalid grant conditions shape (whitelist-only)', {
        errorCode: ERROR_CODES.GRANT_INVALID_CONDITIONS,
      });
    }
    if (result === 'roleNotFound') {
      throw new NotFoundException(`Role not found: ${roleKey}`, {
        errorCode: ERROR_CODES.ROLE_NOT_FOUND,
      });
    }
    if (result === 'duplicate') {
      throw new ConflictException('Grant already exists', {
        errorCode: ERROR_CODES.GRANT_DUPLICATE,
      });
    }
    this.invalidator.invalidate(org);
  }

  async revoke(
    roleKey: string,
    subject: AuthorizationSubject,
    action: AuthorizationAction,
    conditions: Record<string, unknown> | null,
  ): Promise<void> {
    const org = this.org();
    const result = await this.rbac.revoke(org, roleKey, subject, action, conditions, this.actor());
    if (result === 'roleNotFound') {
      throw new NotFoundException(`Role not found: ${roleKey}`, {
        errorCode: ERROR_CODES.ROLE_NOT_FOUND,
      });
    }
    if (result === 'notFound') {
      throw new NotFoundException('Matching grant not found', {
        errorCode: ERROR_CODES.GRANT_NOT_FOUND,
      });
    }
    this.invalidator.invalidate(org);
  }

  /**
   * 成员挂载角色存在性校验（§2.5·S3·供成员/邀请门面复用）：`role` 须 ∈ 系统三 key ∪ 本租户
   * 已存在的自定义角色 key——**查库严格在库 fail-closed**（class-validator 同步式不可查库，故收此处）。
   * 系统三 key 恒可挂（租户尚未 lazy-ensure 时 `findRole` 会查无，故先走内置词汇短路）。
   */
  async isRoleAssignable(role: string): Promise<boolean> {
    if ((SYSTEM_ROLE_KEYS as readonly string[]).includes(role)) return true;
    return (await this.rbac.findRole(this.org(), role)) !== null;
  }

  private org(): string {
    return this.ctx.requireActiveOrganizationId();
  }

  private actor(): string | null {
    return this.ctx.get()?.userId ?? null;
  }

  private mapMutation(result: 'ok' | 'notFound' | 'systemRoleProtected', key: string): void {
    if (result === 'notFound') {
      throw new NotFoundException(`Role not found: ${key}`, {
        errorCode: ERROR_CODES.ROLE_NOT_FOUND,
      });
    }
    if (result === 'systemRoleProtected') {
      throw new ConflictException(`System role is protected: ${key}`, {
        errorCode: ERROR_CODES.ROLE_SYSTEM_PROTECTED,
      });
    }
  }
}
