import { describe, expect, it } from 'vitest';
import { ERROR_CODE_PATTERN, ERROR_CODES, isErrorCode } from './error-codes';

/**
 * 业务错误码契约测（就绪预备 §2.3 #3 · 切片 A）：把「码表是稳定契约」的四条纪律锁死——
 * 文法、key↔value 一一对应、唯一性、命名空间白名单。新增码若不守纪律即红。
 */
const entries = Object.entries(ERROR_CODES);
const ALLOWED_NAMESPACES = new Set([
  'AUTH',
  'ISOLATION',
  'TENANCY',
  'USER',
  'WORKSPACE',
  'BILLING',
  'STORAGE',
]);

describe('ERROR_CODES 契约（shared-kernel·单源码表）', () => {
  it('每个值皆属 NAMESPACE:NAME 文法', () => {
    for (const [key, value] of entries) {
      expect(ERROR_CODE_PATTERN.test(value), `${key}=${value}`).toBe(true);
    }
  });

  it('TS key = 值把冒号换下划线（映射一一对应·防手滑）', () => {
    for (const [key, value] of entries) {
      expect(key).toBe(value.replace(':', '_'));
    }
  });

  it('命名空间 ∈ 允许集（按限界上下文·甲裁）', () => {
    for (const [, value] of entries) {
      const ns = value.split(':')[0] as string;
      expect(ALLOWED_NAMESPACES.has(ns), `unknown namespace: ${ns}`).toBe(true);
    }
  });

  it('值全唯一（无一名两码 / 码族内重复）', () => {
    const values = entries.map(([, v]) => v);
    expect(new Set(values).size).toBe(values.length);
  });

  it('isErrorCode 正/负两态', () => {
    for (const [, value] of entries) {
      expect(isErrorCode(value)).toBe(true);
    }
    // 畸形：点分（撞事件名）、裸名、小写段、空段
    for (const bad of ['user.registered', 'SEAT_LIMIT', 'tenancy:nope', 'AUTH:', ':FOO', '']) {
      expect(isErrorCode(bad), bad).toBe(false);
    }
  });
});
