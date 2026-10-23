import { describe, expect, it } from 'vitest';
import { evaluate, shouldScan } from './verify-type-escape-ratchet';

describe('shouldScan（扫描口径·产物/生成物/测试不计）', () => {
  it('普通生产 .ts 纳入', () => {
    expect(shouldScan('apps/api/src/main.ts')).toBe(true);
    expect(shouldScan('libs/core/src/tenant-isolation/tenant-isolation.middleware.ts')).toBe(true);
  });
  it('测试/生成物/声明/产物/依赖一律排除', () => {
    expect(shouldScan('apps/api/src/a.test.ts')).toBe(false);
    expect(shouldScan('apps/api/src/a.spec.ts')).toBe(false);
    expect(shouldScan('apps/web/src/routeTree.gen.ts')).toBe(false);
    expect(shouldScan('libs/core/src/x.d.ts')).toBe(false);
    expect(shouldScan('apps/api/dist/main.js.ts')).toBe(false);
    expect(shouldScan('apps/api/node_modules/pkg/index.ts')).toBe(false);
    expect(shouldScan('apps/api/src/readme.md')).toBe(false);
  });
});

describe('evaluate（只紧不扫棘轮判定）', () => {
  it('越界：当前 > 基线 → violation 携增量', () => {
    const { violations, opportunities } = evaluate({ 'a.ts': 5 }, { 'a.ts': 3 });
    expect(violations).toEqual([{ file: 'a.ts', current: 5, baseline: 3 }]);
    expect(opportunities).toHaveLength(0);
  });
  it('基线外新文件带逃逸 → violation（baseline 0）', () => {
    const { violations } = evaluate({ 'new.ts': 1 }, {});
    expect(violations).toEqual([{ file: 'new.ts', current: 1, baseline: 0 }]);
  });
  it('下降：当前 < 基线 → opportunity 非 violation', () => {
    const { violations, opportunities } = evaluate({ 'a.ts': 2 }, { 'a.ts': 6 });
    expect(violations).toHaveLength(0);
    expect(opportunities).toEqual([{ file: 'a.ts', current: 2, baseline: 6 }]);
  });
  it('相等：既非越界亦非下调', () => {
    const { violations, opportunities } = evaluate({ 'a.ts': 4 }, { 'a.ts': 4 });
    expect(violations).toHaveLength(0);
    expect(opportunities).toHaveLength(0);
  });
  it('基线项文件消失 → staleBaseline', () => {
    const { staleBaseline } = evaluate({}, { 'gone.ts': 3 });
    expect(staleBaseline).toEqual(['gone.ts']);
  });
  it('全绿：current 与 baseline 完全一致 → 无违规', () => {
    const cur = { 'a.ts': 2, 'b.ts': 1 };
    const { violations } = evaluate(cur, cur);
    expect(violations).toHaveLength(0);
  });
});
