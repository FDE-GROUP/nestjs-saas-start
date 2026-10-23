import { describe, expect, it } from 'vitest';
import { isSealedOrgHttpPath } from './auth.implement';

/**
 * BA 内置 org 授权 HTTP 面封堵谓词锁测（module-rbac-casl 甲裁·严格拆·DoD「封堵实证」单元面）：
 * pathname 判 `/organization` 段（query 不参与）——我方 auth handler 入口据此直接 404，
 * 授权管理收归 @Can·CASL 门面；BA 服务端 auth.api.* 直调不经 HTTP 不受影响。
 * 真 HTTP 链路面由 auth-http-surface.e2e（env-gated）追加断言。
 */
describe('isSealedOrgHttpPath（BA org 内置授权面封堵谓词）', () => {
  it('36 内置端点代表样全封堵（pathname 命中 /organization 段）', () => {
    for (const p of [
      '/api/v1/auth/organization/list-members',
      '/api/v1/auth/organization/update-member-role',
      '/api/v1/auth/organization/remove-member',
      '/api/v1/auth/organization/invite-member',
      '/api/v1/auth/organization/cancel-invitation',
      '/api/v1/auth/organization/accept-invitation',
      '/api/v1/auth/organization/has-permission',
      '/api/v1/auth/organization/create-role',
      '/api/v1/auth/organization/set-active-team',
      '/api/v1/auth/organization',
    ]) {
      expect(isSealedOrgHttpPath(p), `应封堵 ${p}`).toBe(true);
    }
  });

  it('query 不参与判定（封堵看 pathname 不看串）', () => {
    expect(isSealedOrgHttpPath('/api/v1/auth/organization/get-invitation?id=inv-1')).toBe(true);
    expect(isSealedOrgHttpPath('/api/v1/auth/organization?slug=x')).toBe(true);
  });

  it('非 org 认证面不误伤（sign-in/get-session/回调等照常放行）', () => {
    for (const p of [
      '/api/v1/auth/sign-in/email',
      '/api/v1/auth/sign-up/email',
      '/api/v1/auth/get-session',
      '/api/v1/auth/sign-out',
      '/api/v1/auth/callback/github',
      '/api/v1/auth/organizations', // 复数近形词：不属内置端点，不应误伤
      '/api/v1/tenants/members', // 我方门面路由（唯谓词只在 auth handler 入口使用）
    ]) {
      expect(isSealedOrgHttpPath(p), `不应封堵 ${p}`).toBe(false);
    }
  });
});
