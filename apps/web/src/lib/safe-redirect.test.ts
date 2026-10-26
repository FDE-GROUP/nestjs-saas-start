import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safe-redirect';

describe('safeInternalPath（开放重定向防护）', () => {
  it('站内路径与含查询深链放行', () => {
    expect(safeInternalPath('/posts')).toBe('/posts');
    expect(safeInternalPath('/platform/tenants?q=acme')).toBe('/platform/tenants?q=acme');
  });

  it('缺失/空/绝对外链/协议相对/含 scheme/反斜杠一律拒绝', () => {
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath('')).toBeNull();
    expect(safeInternalPath('http://evil.com')).toBeNull();
    expect(safeInternalPath('//evil.com')).toBeNull();
    expect(safeInternalPath('javascript:alert(1)')).toBeNull();
    expect(safeInternalPath('/\\evil')).toBeNull();
  });
});
