import type { UserStatusService } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import type { PlatformSettings } from '@core/saas-kit/platform/platform-config.port';
import type { PlatformIdentityLookup } from '@core/saas-kit/platform/platform-identity.port';
import { PlatformOperatorGuard } from '@core/saas-kit/platform/platform-operator.guard';

import type { RequestSessionReader } from '@core/saas-kit/tenant-isolation/session/request-session.port';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

function ctxWith(headers: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

/**
 * §9.5.4①B · P1b：会话经 `RequestSessionReader` 端口消费——桩 `read` 返回可信会话视图（或 null）。
 */
function sessionReader(userId: string | undefined): RequestSessionReader {
  return {
    read: vi.fn(async () => (userId ? { userId } : null)),
  } as unknown as RequestSessionReader;
}

/**
 * 桩 `PlatformIdentityLookup`（§9.5.4①B）：email 命中→返回该 email；查无此人→undefined。
 */
function identityReturning(email: string | undefined) {
  const emailOf = vi.fn(async (_userId: string) => email);
  return { identity: { emailOf } as unknown as PlatformIdentityLookup, emailOf };
}

function configWith(operatorEmail: string): PlatformSettings {
  return { operatorEmail: () => operatorEmail } as unknown as PlatformSettings;
}

function userStatusMock(blocked = false) {
  return { isBlocked: async () => blocked } as unknown as UserStatusService;
}

describe('PlatformOperatorGuard (S5 · FR-13 正式判据：email 命中配置)', () => {
  it('allows the session user whose DB email matches the configured operator (case-insensitive)', async () => {
    const { identity } = identityReturning('Admin@Example.com');
    const guard = new PlatformOperatorGuard(
      sessionReader('u1'),
      identity,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith())).resolves.toBe(true);
  });

  it('rejects a generic ADMIN-named user whose email does not match (S4 判据已弃用)', async () => {
    const { identity } = identityReturning('someone-else@example.com');
    const guard = new PlatformOperatorGuard(
      sessionReader('u2'),
      identity,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when no user row is found', async () => {
    const { identity } = identityReturning(undefined);
    const guard = new PlatformOperatorGuard(
      sessionReader('ghost'),
      identity,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the operator email is not configured', async () => {
    const { identity } = identityReturning('admin@example.com');
    const guard = new PlatformOperatorGuard(
      sessionReader('u1'),
      identity,
      configWith(''),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when the operator themselves is suspended (S6 · FR-10 platform layer)', async () => {
    const { identity } = identityReturning('admin@example.com');
    const guard = new PlatformOperatorGuard(
      sessionReader('u1'),
      identity,
      configWith('admin@example.com'),
      userStatusMock(true),
    );
    await expect(guard.canActivate(ctxWith())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws 401 when there is no session', async () => {
    const { identity } = identityReturning('admin@example.com');
    const guard = new PlatformOperatorGuard(
      sessionReader(undefined),
      identity,
      configWith('admin@example.com'),
      userStatusMock(),
    );
    await expect(guard.canActivate(ctxWith())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('looks up the email scoped to the session user id', async () => {
    const { identity, emailOf } = identityReturning('admin@example.com');
    await new PlatformOperatorGuard(
      sessionReader('u9'),
      identity,
      configWith('admin@example.com'),
      userStatusMock(),
    ).canActivate(ctxWith());
    expect(emailOf).toHaveBeenCalledWith('u9');
  });
});
