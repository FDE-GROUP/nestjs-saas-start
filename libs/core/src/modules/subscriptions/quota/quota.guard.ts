import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '../../../shared-kernel/errors/error-codes';
import { TenantIsolationService } from '../../../tenant-isolation/tenant-isolation.service';
import { QUOTA_KEY, type QuotaRequirement } from './quota.decorator';
import { QuotaService } from './quota.service';

/**
 * 逐路由配额守卫（S7 · FR-7）。仅对声明了 `@Quota({ seats })` 的写路径生效：
 * 从 ALS 取活跃租户（缺失 fail-closed → 403），对照生效订阅限额裁决。架构精度修宪 S2：
 * `QuotaService` 不再抛 HTTP（P1·裁决返 result-union），**402 翻译归本守卫**（适配器
 * 角色文件·合法抛点）。未标注 `@Quota` 直接放行（opt-in）。
 *
 * 与 `AuthorizationGuard` 一致：经 `@UseGuards` 逐路由挂载，**不升级为全局
 * APP_GUARD**（blast radius=每路由·高危#4 挂账）。生产挂点（BA member-add 路由）
 * 为接线点留后续切片，本片以单测/守卫测坐实超限拒绝。
 */
@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TenantIsolationService) private readonly tenantContext: TenantIsolationService,
    @Inject(QuotaService) private readonly quota: QuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<QuotaRequirement | undefined>(QUOTA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // 未声明配额需求 → 非本守卫关注点，放行。
    if (!requirement) return true;

    const organizationId = this.tenantContext.organizationId;
    if (!organizationId)
      throw new ForbiddenException('No active organization context', {
        errorCode: ERROR_CODES.ISOLATION_NO_ACTIVE_CONTEXT,
      });

    const delta = requirement.seats ?? 1;
    const verdict = await this.quota.checkSeats(organizationId, delta);
    if (!verdict.ok) {
      // 402 = Payment Required（语义=需升级档位）；errorCode 供前端/客户端分支。
      throw new HttpException(
        `Seat quota exceeded: ${verdict.used}+${delta} > ${verdict.limit}`,
        HttpStatus.PAYMENT_REQUIRED,
        { errorCode: ERROR_CODES.BILLING_SEAT_LIMIT_EXCEEDED },
      );
    }
    return true;
  }
}
