import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { OrganizationStatusService } from '../modules/organizations/lifecycle/organization-status.service';
import { UserStatusService } from '../modules/organizations/lifecycle/user-status.service';
import { type RequestSessionReader, SESSION_READER } from './session/request-session.port';
import { type TenantIsolationScope, tenantIsolationStorage } from './tenant-isolation-scope';

/**
 * Resolves the active tenant for each request and binds it to AsyncLocalStorage
 * (global-tenancy §9.3 / FR-2). Reads the trusted session (user id + `activeOrganizationId`)
 * through the core-owned `RequestSessionReader` port — no Better Auth / `@app/modules/auth`
 * import crosses into tenancy core (§9.5.4①B · P1b). Downstream guards / services read the
 * bound context via `TenantIsolationService`.
 *
 * The port's `read` already short-circuits public / auth / bypass routes (and any request
 * without a session cookie) to `null`, so this adds a session lookup only where one can
 * exist. Failures degrade to "no tenant" rather than throwing (enforcement is S2).
 */
@Injectable()
export class TenantIsolationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantIsolationMiddleware.name);

  constructor(
    @Inject(SESSION_READER)
    private readonly session: RequestSessionReader,
    @Inject(OrganizationStatusService)
    private readonly tenantStatus: OrganizationStatusService,
    @Inject(UserStatusService)
    private readonly userStatus: UserStatusService,
  ) {}

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
        // module-rbac-casl 丙裁：会话解析点预注入的成员角色（BA 数据面事实·CASL 裁决输入）。
        const role = view.role;
        // S3 · workspace 二级边界 (D2/§9.2): the active workspace is a per-request
        // selector read from the `x-workspace-id` header (header may override — §9.2).
        // OPTIONAL: absent → request runs at tenant scope. Cross-tenant safety never
        // depends on this value — the repository always ANDs the trusted `organizationId`;
        // the workspace only narrows within the tenant (workspace 间互不可见).
        const wsHeader = req?.headers?.['x-workspace-id'];
        const workspaceId =
          typeof wsHeader === 'string' && wsHeader.length > 0 ? wsHeader : undefined;

        const bind = (boundOrganizationId: string | undefined, boundUserId?: string): void => {
          const ctx: TenantIsolationScope = {
            organizationId: boundOrganizationId,
            workspaceId,
            userId: boundUserId,
            // 无租户则无角色：封禁/失能路径下 role 一并清空（与「既不绑租户也不绑身份」同构）。
            role: boundOrganizationId ? role : undefined,
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
          // S4 · FR-1 审批制失能卡点 (deny-list): a tenant explicitly pending approval /
          // suspended / deleted binds NO organizationId → downstream TenantIsolationGuard fails
          // closed (403) on business routes. No status recorded (legacy/seeded) → allowed,
          // so existing dev tenants are never locked. Async: only pay the extra read when
          // a tenant is actually resolved.
          if (!organizationId) {
            bind(undefined, userId);
            return;
          }
          return this.tenantStatus
            .isBlocked(organizationId)
            .then((blocked) => bind(blocked ? undefined : organizationId, userId))
            .catch(() => bind(undefined, userId)); // fail-closed: unresolvable status → no tenant
        });
      })
      .catch((err: Error) => {
        this.logger.warn(`tenant-isolation context skipped: ${err.message}`);
        next();
      });
  }
}
