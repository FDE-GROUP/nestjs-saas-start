import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { TenantRole } from '../authorization/authorization-rules';
import { TenantStatusService } from '../modules/organizations/lifecycle/tenant-status.service';
import { UserStatusService } from '../modules/organizations/lifecycle/user-status.service';
import { type RequestSessionReader, SESSION_READER } from './session/request-session.port';
import { type TenantIsolationScope, tenantIsolationStorage } from './tenant-isolation-scope';
import { TENANT_SCOPE_RESOLVER, type TenantScopeResolver } from './tenant-scope-resolver.port';

/**
 * 逐请求解析活跃租户并绑定至 AsyncLocalStorage（global-tenancy §9.3 / FR-2）。
 *
 * @remarks
 * Resolves the active tenant for each request and binds it to AsyncLocalStorage
 * (global-tenancy §9.3 / FR-2). Reads the trusted session (user id + `activeOrganizationId`)
 * through the core-owned `RequestSessionReader` port — no Better Auth / `@app/modules/auth`
 * import crosses into tenancy core (§9.5.4①B · P1b). Downstream guards / services read the
 * bound context via `TenantIsolationService`.
 *
 * global-tenant-organization-rehierarchy 切片 C 换轴：封禁检查通过后另经 `TENANT_SCOPE_RESOLVER`
 * 把活动组织升为**主轴 `tenantId`**（隔离硬边界·同租跨组织默认互见）；解析不出租户 →
 * 不绑主轴 → guard fail-closed 403（组织轴仍绑定仅供归属/派生消费，不构成放行）。
 * The port's `read` already short-circuits public / auth / bypass routes (and any request
 * without a session cookie) to `null`, so this adds a session lookup only where one can
 * exist. Failures degrade to "no tenant" rather than throwing (enforcement is S2).
 *
 * @public
 */
@Injectable()
export class TenantIsolationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantIsolationMiddleware.name);

  constructor(
    @Inject(SESSION_READER)
    private readonly session: RequestSessionReader,
    @Inject(TenantStatusService)
    private readonly tenantStatus: TenantStatusService,
    @Inject(UserStatusService)
    private readonly userStatus: UserStatusService,
    @Inject(TENANT_SCOPE_RESOLVER)
    private readonly tenantScope: TenantScopeResolver,
  ) {}

  /**
   * 解析会话→（封禁/失能 fail-closed 后）绑定租户作用域·随后放行 `next`。
   *
   * @param req - 入站请求（读会话 + `x-workspace-id` 头）
   * @param _res - 响应（本中间件不写响应·仅透传）
   * @param next - 下游继续执行
   */
  use(req: any, _res: any, next: () => void): void {
    this.session
      .read(req)
      .then((view) => {
        // No trusted session context (bypass / no cookie / no session) → pass straight through.
        if (!view) {
          next();
          return;
        }

        const organizationId = view.activeOrganizationId;
        const userId = view.userId;
        // 第三次复裁切片 4·D7：显式租级激活位（无活动组织也可建立租上下文·解「org 绑架」）。
        const explicitTenantId = view.activeTenantId;
        // S3 · workspace 二级边界 (D2/§9.2): the active workspace is a per-request
        // selector read from the `x-workspace-id` header (header may override — §9.2).
        // OPTIONAL: absent → request runs at tenant scope. Cross-tenant safety never
        // depends on this value — the repository always ANDs the trusted `organizationId`;
        // the workspace only narrows within the tenant (workspace 间互不可见).
        const wsHeader = req?.headers?.['x-workspace-id'];
        const workspaceId =
          typeof wsHeader === 'string' && wsHeader.length > 0 ? wsHeader : undefined;

        // global-role-membership-tenantization 切片 C 换源：会话角色不再随会话携带（已从 SessionView 删），
        // 改在**活动租户解析后**经 `TENANT_SCOPE_RESOLVER.resolveTenantRole` 从自有 `tenant_role_assignment`
        // 按租户解析（角色只随活动租户·切 org 不翻角色）。解析失败/非成员 → undefined（守卫 fail-closed 403）。
        const resolveRole = (
          tenantId: string,
          boundUser?: string,
        ): Promise<TenantRole | undefined> =>
          boundUser
            ? this.tenantScope.resolveTenantRole(tenantId, boundUser).catch(() => undefined)
            : Promise.resolve(undefined);

        const bind = (
          boundOrganizationId: string | undefined,
          boundUserId?: string,
          boundTenantId?: string,
          boundOrgVisibility?: string,
          boundRole?: TenantRole,
        ): void => {
          const ctx: TenantIsolationScope = {
            // 主轴（隔离硬边界）：无封禁组织才解析得出租户；封禁/失能路径下一并清空。
            tenantId: boundTenantId,
            organizationId: boundOrganizationId,
            workspaceId,
            userId: boundUserId,
            // X7 换轴：角色只随**活动租户**解析（弃 org 维）；无租户则无角色·封禁/失能路径下留空。
            role: boundTenantId ? boundRole : undefined,
            // 租内跨组织可见性策略（第三次复裁切片 3）：仅随主轴租户一同绑定；封禁/无租户路径下留空。
            orgVisibility: boundTenantId ? boundOrgVisibility : undefined,
          };
          tenantIsolationStorage.run(ctx, next);
        };

        // S6 · FR-10 (deny-list · 用户层失能): a platform-suspended user binds neither a
        // tenant nor an identity → every downstream guard (tenant / user / platform layer)
        // fails closed. Checked before tenant resolution because suspension is global
        // (all tenants) — defense-in-depth alongside session hard-invalidation.
        const userCheck = userId ? this.userStatus.isBlocked(userId) : Promise.resolve(false);
        return userCheck.then((userBlocked) => {
          if (userBlocked) {
            bind(undefined, undefined);
            return;
          }
          // S4 · FR-1 审批制失能卡点 (deny-list·global-tenant-organization-rehierarchy 切片 E-F 治理换轴)：
          // 治理准入态权威从 `organization.status` 上移归位 `tenant.status`——审批只管租户准入。先经
          // `TENANT_SCOPE_RESOLVER` 把活动组织升为主轴 tenantId，再对**租户**判失能：显式 pending_approval /
          // suspended / deleted 的租户 → bind 清空（guard fail-closed 403）。无租户归属（expand 段未盖章增量）
          // → 不绑主轴（403）；租户无状态记录（存量/seeded·视同 active）→ 放行，绝不误锁既有 dev 租户。
          // 第三次复裁切片 4·D7（租户激活解绑）解析序：**显式 activeTenantId 优先** → 回落 activeOrganizationId 派生。
          // 显式租轴经「设活动租户」端点校验成员资格后才落 session（本处不再校·与 BA 信任 activeOrganizationId 同模），
          // 但仍过租户失能卡点（deny-list）。无活动组织时组织轴留空（role 随之缺省·org 级 @Can fail-closed）。
          // P0 修复 X2（读侧 fail-closed 校验）：显式租 + 活动 org 同在时必校 org∈tenant——写侧双激活位互斥
          // （setActiveOrganization 清租位/setActiveTenant 清 org）后二者不应共存；本校验兜历史/手改/服务端透传
          // 未清位遗留的混态 `{activeTenantId=T1, activeOrganizationId=O2∈T2}`：不一致/解析不出 → 不绑主轴（guard 403），
          // 绝不回退用他租 org 冒充租户轴（借该 org 的 membership role 在他租行权 = 租内提权泄露面）。
          if (explicitTenantId) {
            return this.tenantStatus.isBlocked(explicitTenantId).then((blocked) => {
              if (blocked) return bind(undefined, userId);
              if (organizationId) {
                return this.tenantScope
                  .resolveTenantScopeOf(organizationId)
                  .then((scope) => {
                    if (!scope || scope.tenantId !== explicitTenantId)
                      return bind(undefined, userId);
                    return resolveRole(explicitTenantId, userId).then((r) =>
                      bind(organizationId, userId, explicitTenantId, scope.orgVisibility, r),
                    );
                  })
                  .catch(() => bind(undefined, userId)); // fail-closed: 校验不可得 → 不绑租户
              }
              return this.tenantScope
                .readOrgVisibility(explicitTenantId)
                .then((vis) =>
                  resolveRole(explicitTenantId, userId).then((r) =>
                    bind(undefined, userId, explicitTenantId, vis, r),
                  ),
                )
                .catch(() => bind(undefined, userId, explicitTenantId));
            });
          }
          // 回落：无显式激活租 → 经活动组织派生主轴 tenantId（rehierarchy 切片 C 换轴·向后兼容）。
          if (!organizationId) {
            // 切片 G·G5：纯租级成员冷启动（既无活动 org 又无显式活动租）→ 该 user 恰属单一租户时缺省绑该租
            //（仅作指针·免手动切租）；零/多租、被封禁、解析不可得一律维持 fail-closed 不绑主轴（guard 403）。
            // 跨租地板不弱化：主轴仅取该 user 自身 `tenant_membership`，角色仍经 `resolveTenantRole` 按活动租从
            // `tenant_role_assignment` 解（非成员→undefined→@Can 403），org 分区读面仍因无活动 org fail-closed。
            if (!userId) {
              bind(undefined, userId);
              return;
            }
            return this.tenantScope
              .defaultTenantForUser(userId)
              .then((defaultTenantId) => {
                if (!defaultTenantId) return bind(undefined, userId);
                return this.tenantStatus.isBlocked(defaultTenantId).then((blocked) => {
                  if (blocked) return bind(undefined, userId);
                  return this.tenantScope
                    .readOrgVisibility(defaultTenantId)
                    .then((vis) =>
                      resolveRole(defaultTenantId, userId).then((r) =>
                        bind(undefined, userId, defaultTenantId, vis, r),
                      ),
                    )
                    .catch(() => bind(undefined, userId, defaultTenantId));
                });
              })
              .catch(() => bind(undefined, userId)); // fail-closed: 缺省解析不可得 → 维持不绑
          }
          return this.tenantScope
            .resolveTenantScopeOf(organizationId)
            .then((scope) => {
              // 解析不出租户归属：保留组织轴供归属面消费、主轴留空（guard 仍 fail-closed 403）。
              if (!scope) return bind(organizationId, userId);
              return this.tenantStatus.isBlocked(scope.tenantId).then((blocked) => {
                if (blocked) return bind(undefined, userId);
                return resolveRole(scope.tenantId, userId).then((r) =>
                  bind(organizationId, userId, scope.tenantId, scope.orgVisibility, r),
                );
              });
            })
            .catch(() => bind(undefined, userId)); // fail-closed: 解析/状态不可得 → 不绑租户
        });
      })
      .catch((err: Error) => {
        this.logger.warn(`tenant-isolation context skipped: ${err.message}`);
        next();
      });
  }
}
