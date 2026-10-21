import { describe, expect, it } from 'vitest';
import { selectStorageProvider } from './provider-selection.policy';

/**
 * 存储通道选择/降级策略纯单测（domain 零框架依赖）。
 * 锁「命中配置指定者 / 未注册回落 s3 / 自定义 fallback」三分支，对齐迁移前构造期行为。
 */
describe('selectStorageProvider（domain 策略）', () => {
  const s3 = { name: 's3' };
  const alioss = { name: 'alioss' };

  it('命中配置指定 provider', () => {
    expect(selectStorageProvider({ s3, alioss }, 'alioss')).toBe(alioss);
  });

  it('配置 provider 未注册 → 回落 s3', () => {
    expect(selectStorageProvider({ s3 }, 'alioss')).toBe(s3);
  });

  it('可自定义 fallback key', () => {
    expect(selectStorageProvider({ s3, alioss }, 'missing', 'alioss')).toBe(alioss);
  });
});
