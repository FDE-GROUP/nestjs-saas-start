import type { UserStatusService } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InjectAuthInstance } from '../../auth.interface';
import { SessionGuard } from './session.guard';

function userStatusMock(blocked = false) {
  return { isBlocked: async () => blocked } as unknown as UserStatusService;
}

/** S11：全局墙下 SessionGuard 新增 Reflector 依赖·默认无 @Public 元数据（旁路不触发）。 */
function reflectorStub() {
  return { getAllAndOverride: () => undefined } as never;
}

function ctxWith(headers: Record<string, string>): ExecutionContext {
  const req: { headers: Record<string, string>; sessionUser?: { id: string; email: string } } = {
    headers,
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('SessionGuard (PIPL · C1)', () => {
  const getSession = vi.fn();
  const authInstance = {
    get: () => ({ api: { getSession } }) as never,
    set: () => {},
  } satisfies InjectAuthInstance;

  let guard: SessionGuard;
  beforeEach(() => {
    getSession.mockReset();
    guard = new SessionGuard(authInstance, userStatusMock(), reflectorStub());
  });

  it('passes and attaches sessionUser when session resolves', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' }, session: {} });
    const ctx = ctxWith({ cookie: 'session=abc' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    const req = ctx.switchToHttp().getRequest<{ sessionUser?: { id: string; email: string } }>();
    expect(req.sessionUser).toEqual({ id: 'u1', email: 'a@b.c' });
    expect(getSession).toHaveBeenCalledWith({ headers: { cookie: 'session=abc' } });
  });

  it('throws 401 when session is null', async () => {
    getSession.mockResolvedValue(null);
    await expect(guard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws 403 for a platform-suspended user (S6 · FR-10 user layer)', async () => {
    getSession.mockResolvedValue({ user: { id: 'u9', email: 'a@b.c' }, session: {} });
    const suspended = new SessionGuard(authInstance, userStatusMock(true), reflectorStub());
    await expect(suspended.canActivate(ctxWith({}))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws 500-style Unauthorized when auth instance not yet initialized', async () => {
    const coldGuard = new SessionGuard(
      { get: () => undefined as never, set: () => {} },
      userStatusMock(),
      reflectorStub(),
    );
    await expect(coldGuard.canActivate(ctxWith({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('S11 · @Public 旁路：声明公共的路由跳过会话墙（不调 getSession、不因无会话 401）', async () => {
    // getSession 未 stub（若未旁路则因会话为 null 而 401）→ 断言返回 true 即证明旁路生效。
    const publicReflector = { getAllAndOverride: () => true } as never;
    const pubGuard = new SessionGuard(authInstance, userStatusMock(), publicReflector);
    await expect(pubGuard.canActivate(ctxWith({}))).resolves.toBe(true);
    expect(getSession).not.toHaveBeenCalled();
  });
});
