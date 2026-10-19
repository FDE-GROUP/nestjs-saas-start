import { describe, expect, it } from 'vitest';
import defaultConfig from './default';
import developmentConfig from './development';
import productionConfig from './production';

// 回归锁（module-common-cors-whitelist）：三份 env 的 cors.origin 必须是「白名单数组」，
// 不得再退回 `origin:'*'` 字面量（外部评审 🔴-1：'*' + credentials:true 违反 CORS 凭证语义，
// 且同喂 Better Auth trustedOrigins='*'）。parseCorsOrigins 恒返数组，故本断言与环境变量无关。
describe('cors env whitelist (no wildcard origin)', () => {
  const cases: Array<[string, { cors: { origin: unknown; credentials: boolean } }]> = [
    ['default', defaultConfig],
    ['development', developmentConfig],
    ['production', productionConfig],
  ];

  it.each(cases)('%s.cors.origin 是数组且不含 *', (_name, cfg) => {
    expect(Array.isArray(cfg.cors.origin)).toBe(true);
    expect(cfg.cors.origin as unknown[]).not.toContain('*');
  });
});
