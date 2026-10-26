import { describe, expect, it } from 'vitest';
import { mergePredicatesWithOr, toMikroPredicate } from './instance-predicate';

/**
 * conditions→Mikro 受限转换器锁测（module-rbac-query-level-filtering 切片 A）。
 * 钉死 grammar（人裁①·与写侧闸 `isValidGrantConditions` 同形）与 fail-closed 语义：
 *  ① 等值 + $in 多值译词；② `{{userId}}` 模板解析（标量与 $in 元素）；③ 缺 userId 留字面
 *  （DB 落空 = 空集·保守 deny）；④ grammar 外一律 throw（绝不静默放行）；⑤ $or 合并三态。
 */

describe('toMikroPredicate（受限转换器·人裁①含 $in）', () => {
  it('等值：原始量直译为 Mikro 等值键', () => {
    expect(toMikroPredicate({ ownerId: 'u1' })).toEqual({ ownerId: 'u1' });
    expect(toMikroPredicate({ archived: false, n: 42, deletedAt: null })).toEqual({
      archived: false,
      n: 42,
      deletedAt: null,
    });
  });

  it('{{userId}} 模板：标量按当前操作者解析为实值', () => {
    expect(toMikroPredicate({ ownerId: '{{userId}}' }, 'u9')).toEqual({ ownerId: 'u9' });
    // 混合模板前后缀也解析（承 S4 split/join 语义）
    expect(toMikroPredicate({ path: 'x/{{userId}}/y' }, 'u9')).toEqual({ path: 'x/u9/y' });
  });

  it('缺 userId ⇒ 留字面模板（DB 等值必落空 = 空集·保守 deny·绝不回退全量）', () => {
    expect(toMikroPredicate({ ownerId: '{{userId}}' })).toEqual({ ownerId: '{{userId}}' });
  });

  it('{{organizationId}} 模板（第三次复裁 切片 2·D1）：按活动 org 解析·缺值留字面', () => {
    // 标量解析为活动 org 实值
    expect(toMikroPredicate({ organizationId: '{{organizationId}}' }, undefined, 'orgZ')).toEqual({
      organizationId: 'orgZ',
    });
    // userId 与 organizationId 同格双模板各解各的
    expect(
      toMikroPredicate({ ownerId: '{{userId}}', org: '{{organizationId}}' }, 'u9', 'orgZ'),
    ).toEqual({ ownerId: 'u9', org: 'orgZ' });
    // 缺 organizationId（无活动 org）⇒ 留字面（DB 落空 deny）
    expect(toMikroPredicate({ organizationId: '{{organizationId}}' }, 'u9')).toEqual({
      organizationId: '{{organizationId}}',
    });
    // $in 元素内的 {{organizationId}} 也逐一解析
    expect(
      toMikroPredicate({ orgs: { $in: ['{{organizationId}}', 'x'] } }, undefined, 'orgZ'),
    ).toEqual({ orgs: { $in: ['orgZ', 'x'] } });
  });

  it('$in 多值：非空原始量数组译为 Mikro 同名操作符', () => {
    expect(toMikroPredicate({ role: { $in: ['a', 'b'] } })).toEqual({ role: { $in: ['a', 'b'] } });
    expect(toMikroPredicate({ n: { $in: [1, 2, 3] } })).toEqual({ n: { $in: [1, 2, 3] } });
  });

  it('$in 内 {{userId}} 模板元素逐一解析', () => {
    expect(toMikroPredicate({ ids: { $in: ['{{userId}}', 'x'] } }, 'u9')).toEqual({
      ids: { $in: ['u9', 'x'] },
    });
    // 缺 userId：模板元素留字面（成员必落空）
    expect(toMikroPredicate({ ids: { $in: ['{{userId}}'] } })).toEqual({
      ids: { $in: ['{{userId}}'] },
    });
  });

  it('行内多字段 = AND（同对象并列·CASL conditions 同语义）', () => {
    expect(toMikroPredicate({ ownerId: '{{userId}}', archived: false }, 'u9')).toEqual({
      ownerId: 'u9',
      archived: false,
    });
  });

  it('grammar 外一律 throw（不静默放行）', () => {
    // 非-$in 运算符
    expect(() => toMikroPredicate({ n: { $gt: 1 } })).toThrow();
    // 直接数组值
    expect(() => toMikroPredicate({ tags: ['a', 'b'] })).toThrow();
    // 空 $in
    expect(() => toMikroPredicate({ role: { $in: [] } })).toThrow();
    // $in 元素含嵌套对象（非原始量）
    expect(() => toMikroPredicate({ role: { $in: [{ a: 1 }] } })).toThrow();
    // 非-$in 多键嵌套对象
    expect(() => toMikroPredicate({ a: { b: 1, c: 2 } })).toThrow();
    // 空对象（应走类型级 null·由调用点筛除，误入即 throw）
    expect(() => toMikroPredicate({})).toThrow();
  });
});

describe('mergePredicatesWithOr（人裁②·$or 并语义）', () => {
  it('空数组 = undefined（调用点归 none·fail-closed 空集）', () => {
    expect(mergePredicatesWithOr([])).toBeUndefined();
  });

  it('单行省一层 $or，直接返回该译词', () => {
    const one = { ownerId: 'u9' };
    expect(mergePredicatesWithOr([one])).toEqual(one);
  });

  it('多行 = { $or: [...] }（任一 allow 即可见·与 CASL check 级并语义同解）', () => {
    expect(mergePredicatesWithOr([{ ownerId: 'u1' }, { teamId: 't1' }])).toEqual({
      $or: [{ ownerId: 'u1' }, { teamId: 't1' }],
    });
  });
});
