import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { HttpException } from '@nestjs/common';
import type { CommandBus } from '@nestjs/cqrs';
import type { CreateOrganizationApplication } from '@saas/contracts/index';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationsController } from './organizations.controller';

/**
 * 建租申请门面单测（修「重复 slug → 500」缺陷·对齐 epic-02 §2.1 / module-rbac-casl §2.3.1）：
 * `apply` 经 BA `createOrganization` 服务端系统动作，BA 4xx `APIError` 须经门面统一出口
 * `mapBaError` 归一透传状态（不再逃逸为 500）并附泛用业务 `errorCode`（承 followups 项①）；
 * 成功原样透传读模型；5xx/未知不伪装交全局过滤器。
 * 命令裁决/仓储落库由 gated e2e 覆盖，此处只锁控制器错误出口形状。
 */

const USER = { id: 'u1' } as SessionUser;
const DTO = { name: 'Verify Tenant', slug: 'verify-slug' } as CreateOrganizationApplication;

function ctrlWith(execute: unknown): OrganizationsController {
  return new OrganizationsController({ execute } as unknown as CommandBus);
}

describe('OrganizationsController.apply（建租申请·BA 错误归一出口）', () => {
  it('BA 4xx（重复 slug=ORGANIZATION_ALREADY_EXISTS·真实 APIError 形状：数值 statusCode 400 + 字符串 status）→ 透传 400，不逃逸 500', async () => {
    // 真实 better-call APIError：`.statusCode`=400（数值）、`.status`="BAD_REQUEST"（字符串码）。
    // 旧 `mapBaError` 只读 `.status`→Number("BAD_REQUEST")=NaN→原样上抛→500（缺陷）；修复后读 `.statusCode`→400。
    const apiError = Object.assign(new Error('Organization already exists'), {
      statusCode: 400,
      status: 'BAD_REQUEST',
      name: 'APIError',
    });
    const ctrl = ctrlWith(vi.fn().mockRejectedValue(apiError));
    await expect(ctrl.apply(USER, DTO)).rejects.toBeInstanceOf(HttpException);
    await expect(ctrl.apply(USER, DTO)).rejects.toMatchObject({ status: 400 });
    // 4xx 分支附泛用业务码（object response·filter 透传入 envelope.errorCode·承 followups 项①）。
    const err = (await ctrl.apply(USER, DTO).catch((e: unknown) => e)) as HttpException;
    expect(err.getResponse()).toMatchObject({
      message: 'Organization already exists',
      errorCode: ERROR_CODES.TENANCY_PROVIDER_REJECTED,
    });
  });

  it('成功路径：透传 commandBus 返回的读模型（不改造结果形状）', async () => {
    const receipt = { organizationId: 'org-1', status: 'pending_approval' };
    const ctrl = ctrlWith(vi.fn().mockResolvedValue(receipt));
    await expect(ctrl.apply(USER, DTO)).resolves.toBe(receipt);
  });

  it('5xx/未知错误（无 status）原样上抛·交全局异常过滤器（500 面不伪装）', async () => {
    const boom = new Error('db exploded');
    const ctrl = ctrlWith(vi.fn().mockRejectedValue(boom));
    await expect(ctrl.apply(USER, DTO)).rejects.toBe(boom);
  });
});
