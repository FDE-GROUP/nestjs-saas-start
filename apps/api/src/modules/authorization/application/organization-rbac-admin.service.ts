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
  TENANT_RBAC_REPOSITORY,
  type TenantRbacRepository,
  type TenantRoleGrantAdminView,
  type TenantRoleView,
} from '../domain/repositories/organization-rbac.repository';

/**
 * 角色/授权**管理门面应用服务**（module-rbac-dynamic-roles §2.5/§2.6·S3）。
 *
 * @remarks
 * 职责边界（授权在我·事实入 DB）：
 *  - 从 ALS 取活动租户（主轴 `requireActiveTenantId`·fail-closed）+ 活动组织（写路径归属盖章）
 *    与操作者（`userId`·审计 actorId，缺省 null）（rehierarchy 切片 C·角色升租级）；
 *  - 委派 `TenantRbacRepository`（授权事实 SSOT 的唯一读写通道·写侧先过 domain 策略闸并同通道落审计行）；
 *  - 将端口返回的**领域结果码**转译为 HTTP 语义（领域不借异常表达事实，转译归应用层）；
 *  - **写成功后失效本租户投影缓存**（`PermissionInvalidator`·热改即生效·读写分治端口）。
 *
 * 管理职权本身由 controller `@Can(<动作>, 'Role' | 'RoleGrant')` + CASL 守卫裁决（授权面），
 * 本服务不复权限判定（禁散点特判）；自定义角色对成员的挂载存在性校验见 `isRoleAssignable`。
 * @public
 */
@Injectable()
export class TenantRbacAdminService implements RoleAssignabilityReader {
  constructor(
    @Inject(TENANT_RBAC_REPOSITORY) private readonly rbac: TenantRbacRepository,
    @Inject(PERMISSION_INVALIDATOR)
    private readonly invalidator: PermissionInvalidator,
    @Inject(TenantIsolationService) private readonly ctx: TenantIsolationService,
  ) {}

  /**
   * 本租户全部角色（读面·不触发失效）。
   * @returns 角色读模型列表。
   */
  async listRoles(): Promise<TenantRoleView[]> {
    return this.rbac.listRoles(this.tenantId());
  }

  /**
   * 某角色的全量授权行（查无角色 → 404·供管理面回显勾选态 + org 归属·P0 X6）。
   * 走 `listAllGrantsForRole`（不加 org 过滤·全行回显 `organizationId`）而非 `findGrants`（后者为 CASL 适用集裁决）。
   * @param roleKey - 角色 key。
   * @returns 授权行读模型列表（带回显 `organizationId`）。
   *
   * @throws {NotFoundException} 指定 roleKey 的角色不存在时。
   */
  async getGrants(roleKey: string): Promise<TenantRoleGrantAdminView[]> {
    const grants = await this.rbac.listAllGrantsForRole(this.tenantId(), roleKey);
    if (grants === null) {
      throw new NotFoundException(`Role not found: ${roleKey}`, {
        errorCode: ERROR_CODES.ROLE_NOT_FOUND,
      });
    }
    return grants;
  }

  /**
   * 创建自定义角色（领域码转 HTTP：`invalidKey`→400、`duplicate`→409），成功后失效投影缓存。
   * @param key - 角色 key（租户内唯一）。
   * @param name - 人面可读名。
   * @returns 创建后的角色读模型。
   *
   * @throws {BadRequestException} 角色 key 非法时。
   * @throws {ConflictException} 角色 key 已存在时。
   * @throws {NotFoundException} 创建后回读不到角色时。
   */
  async createRole(key: string, name: string): Promise<TenantRoleView> {
    const tenantId = this.tenantId();
    const result = await this.rbac.createRole(tenantId, this.orgId(), key, name, this.actor());
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
    this.invalidator.invalidate(tenantId);
    const role = await this.rbac.findRole(tenantId, key);
    /* c8 ignore next 3 -- created 后必可查回（同事务已提交），防御性兜底非可达分支 */
    if (!role) {
      throw new NotFoundException(`Role not found after create: ${key}`, {
        errorCode: ERROR_CODES.ROLE_NOT_FOUND,
      });
    }
    return role;
  }

  /**
   * 角色改名（`notFound`→404、`systemRoleProtected`→409），成功后失效投影缓存。
   * @param key - 待改名的角色 key。
   * @param name - 新的人面可读名。
   */
  async renameRole(key: string, name: string): Promise<void> {
    const tenantId = this.tenantId();
    const result = await this.rbac.renameRole(tenantId, this.orgId(), key, name, this.actor());
    this.mapMutation(result, key);
    this.invalidator.invalidate(tenantId);
  }

  /**
   * 删除自定义角色（`notFound`→404、`systemRoleProtected`→409），成功后失效投影缓存。
   * @param key - 待删除的角色 key。
   */
  async deleteRole(key: string): Promise<void> {
    const tenantId = this.tenantId();
    const result = await this.rbac.deleteRole(tenantId, this.orgId(), key, this.actor());
    this.mapMutation(result, key);
    this.invalidator.invalidate(tenantId);
  }

  /**
   * 新增授权格（`invalidConditions`→400、`roleNotFound`→404、`duplicate`→409），成功后失效缓存。
   * @param roleKey - 目标角色 key。
   * @param entry - 授权行（subject/action/conditions）。
   *
   * @throws {BadRequestException} grant conditions 形状不在白名单内时。
   * @throws {NotFoundException} 指定角色不存在时。
   * @throws {ConflictException} 授权条目已存在时。
   */
  async grant(
    roleKey: string,
    entry: {
      subject: AuthorizationSubject;
      action: AuthorizationAction;
      conditions: Record<string, unknown> | null;
      organizationId?: string | null;
    },
  ): Promise<void> {
    const tenantId = this.tenantId();
    const result = await this.rbac.grant(tenantId, this.orgId(), roleKey, entry, this.actor());
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
    this.invalidator.invalidate(tenantId);
  }

  /**
   * 撤权（`roleNotFound`→404、无匹配行→404），成功后失效投影缓存。
   * @param roleKey - 目标角色 key。
   * @param subject - 授权主体。
   * @param action - 授权动作。
   * @param conditions - 等值匹配条件；`null` = 整 subject 级行。
   *
   * @throws {NotFoundException} 匹配的授权条目不存在时。
   */
  async revoke(
    roleKey: string,
    subject: AuthorizationSubject,
    action: AuthorizationAction,
    conditions: Record<string, unknown> | null,
    scopeOrgId?: string | null,
  ): Promise<void> {
    const tenantId = this.tenantId();
    const result = await this.rbac.revoke(
      tenantId,
      this.orgId(),
      roleKey,
      subject,
      action,
      conditions,
      this.actor(),
      scopeOrgId,
    );
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
    this.invalidator.invalidate(tenantId);
  }

  /**
   * 成员挂载角色存在性校验（§2.5·S3·供成员/邀请门面复用）：`role` 须 ∈ 系统三 key ∪ 本租户
   * 已存在的自定义角色 key——**查库严格在库 fail-closed**（class-validator 同步式不可查库，故收此处）。
   * 系统三 key 恒可挂（租户尚未 lazy-ensure 时 `findRole` 会查无，故先走内置词汇短路）。
   * @param role - 待校验的角色 key。
   * @returns 可挂载时为 `true`。
   */
  async isRoleAssignable(role: string): Promise<boolean> {
    if ((SYSTEM_ROLE_KEYS as readonly string[]).includes(role)) return true;
    return (await this.rbac.findRole(this.tenantId(), role)) !== null;
  }

  /** 隔离主轴（租级角色分区键·fail-closed）。 */
  private tenantId(): string {
    return this.ctx.requireActiveTenantId();
  }

  /**
   * 写路径审计归属盖章（二级轴·活动组织）：角色目录无 org 列（K5 塌租级）·本值仅供 `tenant_role_audit`
   * 盖章（缺位 fail-closed 拒写）；grant 行的组织 scope 另由 `entry.organizationId`（切片 2·D1）显式指定。
   */
  private orgId(): string {
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
