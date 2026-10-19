import { describe, expect, it } from 'vitest';
import { parseCorsOrigins } from './cors-origins';

describe('parseCorsOrigins', () => {
  it('逗号切分 + trim + 去空', () => {
    expect(parseCorsOrigins('http://a.com, http://b.com ,, http://c.com')).toEqual([
      'http://a.com',
      'http://b.com',
      'http://c.com',
    ]);
  });

  it('无有效项回落 fallback', () => {
    expect(parseCorsOrigins('', ['http://localhost:5173'])).toEqual(['http://localhost:5173']);
    expect(parseCorsOrigins(' , , ', ['x'])).toEqual(['x']);
    expect(parseCorsOrigins(undefined, ['y'])).toEqual(['y']);
  });

  it('缺省 fallback 为空数组（生产 fail-closed）', () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins('')).toEqual([]);
    expect(parseCorsOrigins(null)).toEqual([]);
  });
});
