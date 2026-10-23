import { describe, expect, it } from 'vitest';
import {
  formatProviderDiagnostics,
  planProviderDiagnostics,
  resolveSocialProviders,
  type SocialProviderRegistration,
} from './social-provider-registration';

const secrets = (extra?: Record<string, Record<string, string>>) => ({
  github: { clientId: 'gh_id', clientSecret: 'gh_secret' },
  apple: { clientId: '', clientSecret: '' },
  ...extra,
});

describe('resolveSocialProviders（切片 A 静默跳过可见化·纯裁决面）', () => {
  it('registers a provider with slot + credentials and reports no drop', () => {
    const result = resolveSocialProviders(['github'], secrets());
    expect(result.drops).toEqual([]);
    expect(result.registered).toEqual([
      { type: 'github', clientId: 'gh_id', clientSecret: 'gh_secret', extras: {} },
    ]);
  });

  it('separates the three former silent-skip branches by reason', () => {
    const result: SocialProviderRegistration = resolveSocialProviders(
      ['google', 'apple', 'wecom'],
      secrets(),
    );
    expect(result.registered).toEqual([]);
    expect(result.drops).toEqual([
      { type: 'google', reason: 'no-config-slot' },
      { type: 'apple', reason: 'missing-credentials' },
      { type: 'wecom', reason: 'unknown-type' },
    ]);
  });

  it('passes through non-credential options', () => {
    const result = resolveSocialProviders(
      ['github'],
      secrets({ github: { clientId: 'id', clientSecret: 'secret', scope: 'read:user' } }),
    );
    expect(result.registered[0]?.extras).toEqual({ scope: 'read:user' });
  });

  it('keeps declared casing so the message points back at the config line', () => {
    const result = resolveSocialProviders(['GitLab'], secrets());
    expect(result.drops[0]?.type).toBe('GitLab');
  });
});

describe('planProviderDiagnostics（人裁：非生产 warn + 生产 fail-loud）', () => {
  const drops = resolveSocialProviders(['google'], secrets()).drops;

  it('stays silent when nothing is dropped', () => {
    expect(planProviderDiagnostics([], false)).toEqual({ mode: 'silent', message: '' });
  });

  it('warns outside production with a self-explanatory message', () => {
    const plan = planProviderDiagnostics(drops, false);
    expect(plan.mode).toBe('warn');
    expect(plan.message).toContain('google');
    expect(plan.message).toContain('oauth.secrets');
    // F3 的真误导点：必须点破「光放 *_CLIENT_ID 不生效」
    expect(plan.message).toContain('不会生效');
  });

  it('escalates the same diagnosis to throw in production', () => {
    expect(planProviderDiagnostics(drops, true).mode).toBe('throw');
  });

  it('aggregates every dropped channel in one report', () => {
    const report = formatProviderDiagnostics(
      resolveSocialProviders(['google', 'apple', 'wecom'], secrets()).drops,
    );
    expect(report).toContain('3 个已启用的 OAuth 社交渠道未被注册');
    expect(report).toContain('- google：');
    expect(report).toContain('- apple：');
    expect(report).toContain('- wecom：');
  });
});
