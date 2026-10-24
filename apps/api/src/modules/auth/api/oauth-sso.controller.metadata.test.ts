import 'reflect-metadata';
import { IS_PUBLIC_KEY } from '@core/saas-kit/tenant-isolation/public.decorator';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { authorizeQuerySchema } from '@saas/contracts/index';
import { describe, expect, it } from 'vitest';
import { OauthSsoController } from './oauth-sso.controller';

/**
 * SSO controller 路由元数据 DB-free 锁（oauth-sso-odoo-integration 切片 E·整树 boot 之外的便宜反射段）：
 * 锁住「墙内/旁墙」的分层语义与 schema 值挂接，防漏配/`import type` 致校验或会话墙整链静默跳过
 * （S9 同形风险的等价守卫·posts/organizations 有同类 metadata 测先例）。
 */
describe('OauthSsoController 路由元数据（DB-free·切片 E）', () => {
  it('authorize 的 @Query 携 authorizeQuerySchema（schema 值挂接·防 import type 擦除）', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      OauthSsoController,
      'authorize',
    ) as Record<string, { schema?: unknown }>;
    expect(Object.values(args).some((v) => v.schema === authorizeQuerySchema)).toBe(true);
  });

  it('authorize 未标 @Public → 默认落全局会话墙内（deny-by-default）', () => {
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, OauthSsoController.prototype.authorize);
    expect(isPublic).toBeFalsy();
  });

  it('userinfo 标 @Public → 旁会话墙（自带 Bearer 验签·Odoo 服务端回源无 cookie）', () => {
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, OauthSsoController.prototype.userinfo);
    expect(isPublic).toBe(true);
  });
});
