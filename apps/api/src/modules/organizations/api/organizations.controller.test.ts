import type { SessionUser } from '@app/modules/auth/api/guards/session.guard';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import type { CommandBus } from '@nestjs/cqrs';
import { call, ORPCError } from '@orpc/server';
import type { CreateOrganizationApplication } from '@saas/contracts/index';
import { describe, expect, it, vi } from 'vitest';
import { OrganizationsController } from './organizations.controller';

/**
 * 建租申请门面单测（修「重复 slug → 500」缺陷·对齐 epic-02 §2.1 / module-rbac-casl §2.3.1）：
 * `apply` 经 BA `createOrganization` 服务端系统动作，BA 4xx `APIError` 须经门面统一出口
 * `mapBaError` 归一透传状态（不再逃逸为 500）并附泛用业务 `errorCode`（承 followups 项①）；
 * 成功原样透传读模型；5xx/未知不伪装交全局过滤器。
 * 命令裁决/仓储落库由 gated e2e 覆盖，此处只锁控制器错误出口形状。
 *
 * 换轨 WP-C：`apply` 转 per-method `@Impl`（方法返回 procedure·主体经 context.user）·经 `call` 驱动。
 * in-handler `mapBaError` 抛的 `HttpException` 现由 WP-D `restErrorMiddleware` 归一为 `ORPCError`
 * （状态经 code·原始 getResponse 塞 `data.__rest` 供逐字 REST 信封复刻·见 e2e）；非-HttpException 原样透传。
 */

const USER = { id: 'u1' } as SessionUser;
const DTO = { name: 'Verify Tenant', slug: 'verify-slug' } as CreateOrganizationApplication;

function ctrlWith(execute: unknown): OrganizationsController {
  return new OrganizationsController({ execute } as unknown as CommandBus);
}

const applyCall = (ctrl: OrganizationsController) =>
  call(ctrl.apply(), DTO, { context: { user: USER } });

describe('OrganizationsController.apply（建租申请·BA 错误归一出口）', () => {
  it('BA 4xx（重复 slug·真实 APIError：数值 statusCode 400 + 字符串 status）→ 归一 BAD_REQUEST·__rest 携逐字 400 体', async () => {
    // 真实 better-call APIError：`.statusCode`=400（数值）、`.status`="BAD_REQUEST"（字符串码）。
    // 旧 `mapBaError` 只读 `.status`→Number("BAD_REQUEST")=NaN→原样上抛→500（缺陷）；修复后读 `.statusCode`→400。
    const apiError = Object.assign(new Error('Organization already exists'), {
      statusCode: 400,
      status: 'BAD_REQUEST',
      name: 'APIError',
    });
    const ctrl = ctrlWith(vi.fn().mockRejectedValue(apiError));
    const caught = await applyCall(ctrl).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ORPCError);
    expect((caught as ORPCError<string, unknown>).code).toBe('BAD_REQUEST');
    // 4xx 分支附泛用业务码（object response·filter 透传入 envelope.errorCode·承 followups 项①）。
    expect((caught as { data: { __rest: Record<string, unknown> } }).data.__rest).toMatchObject({
      message: 'Organization already exists',
      errorCode: ERROR_CODES.ORG_PROVISIONING_REJECTED,
    });
  });

  it('成功路径：透传 commandBus 返回的读模型（`.output` 校验后为剥离副本·形不变）', async () => {
    const receipt = { organizationId: 'org-1', status: 'pending_approval' };
    const ctrl = ctrlWith(vi.fn().mockResolvedValue(receipt));
    await expect(applyCall(ctrl)).resolves.toEqual(receipt);
  });

  it('5xx/未知错误（无 status·非 HttpException）原样上抛·middleware 不改写·交全局过滤器（500 面不伪装）', async () => {
    const boom = new Error('db exploded');
    const ctrl = ctrlWith(vi.fn().mockRejectedValue(boom));
    const caught = await applyCall(ctrl).catch((error: unknown) => error);
    expect(caught).toBe(boom);
    expect(caught).not.toBeInstanceOf(ORPCError);
  });
});
