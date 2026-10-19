import type { ConfigService } from '@app/config/config.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CsrfOriginGuard } from './csrf-origin.guard';

function ctx(method: string, headers: Record<string, string>): ExecutionContext {
  const req = { method, headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

function guard(allowOrigins: string | string[], isPublic = false) {
  const configService = {
    getCorsConfig: () => ({ origin: allowOrigins }),
  } as unknown as ConfigService;
  const reflector = { getAllAndOverride: vi.fn(() => (isPublic ? true : undefined)) } as never;
  return new CsrfOriginGuard(reflector, configService);
}

describe('CsrfOriginGuard (module-auth-csrf-defense 甲)', () => {
  it('@Public 面跳过（不读方法/Origin）', () => {
    expect(
      guard(['http://good.com'], true).canActivate(ctx('POST', { origin: 'http://evil' })),
    ).toBe(true);
  });

  it('安全方法跳过：GET 带外站 Origin 亦放行', () => {
    expect(guard(['http://good.com']).canActivate(ctx('GET', { origin: 'http://evil' }))).toBe(
      true,
    );
  });

  it('白名单内 Origin 放行', () => {
    expect(guard(['http://good.com']).canActivate(ctx('POST', { origin: 'http://good.com' }))).toBe(
      true,
    );
  });

  it('同源放行：Origin host 命中请求 Host（白名单空亦放行·scheme 无关）', () => {
    expect(guard([]).canActivate(ctx('POST', { origin: 'https://app.com', host: 'app.com' }))).toBe(
      true,
    );
  });

  it('X-Forwarded-Host 命中亦判同源（反代后真实公网 host）', () => {
    expect(
      guard([]).canActivate(
        ctx('POST', {
          origin: 'https://app.com',
          'x-forwarded-host': 'app.com',
          host: 'internal:7009',
        }),
      ),
    ).toBe(true);
  });

  it('白名单外 Origin → 403 + CSRF 错误码', () => {
    expect.assertions(2);
    try {
      guard(['http://good.com']).canActivate(ctx('POST', { origin: 'http://evil.com' }));
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        errorCode: ERROR_CODES.AUTH_CSRF_ORIGIN_MISMATCH,
      });
    }
  });

  it('同源 host 不同且不在白名单 → 403', () => {
    expect.assertions(1);
    try {
      guard(['http://good.com']).canActivate(
        ctx('POST', { origin: 'http://evil.com', host: 'app.com' }),
      );
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
    }
  });

  it('无 Origin 回退 Referer 的 origin（命中白名单放行）', () => {
    expect(
      guard(['http://good.com']).canActivate(ctx('DELETE', { referer: 'http://good.com/x/y' })),
    ).toBe(true);
  });

  it('无 Origin/Referer（服务直连）→ warn 放行（非 fail-closed）', () => {
    expect(guard(['http://good.com']).canActivate(ctx('POST', {}))).toBe(true);
  });

  it("白名单含 '*' → 任意 Origin 放行", () => {
    expect(guard('*').canActivate(ctx('PATCH', { origin: 'http://anywhere' }))).toBe(true);
  });
});
