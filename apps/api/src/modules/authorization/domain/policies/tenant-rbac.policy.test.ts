import { describe, expect, it } from 'vitest';
import {
  canonicalConditions,
  isReservedRoleKey,
  isValidGrantConditions,
  isValidRoleKey,
} from './tenant-rbac.policy';

/**
 * RBAC 写侧策略闸单测（module-rbac-dynamic-roles S1·conditions 白名单判据）。
 * 闸先紧后松：白名单外形状一律拒（fail-closed），S4 扩运算符时在此文件加例不放闸。
 */

describe('isValidRoleKey / isReservedRoleKey', () => {
  it('常规自定义 key 过闸', () => {
    expect(isValidRoleKey('editor')).toBe(true);
    expect(isValidRoleKey('read-only_support2')).toBe(true);
    expect(isValidRoleKey('a')).toBe(true);
  });

  it('词法闸拒：大写/非法首字符/超长/空', () => {
    expect(isValidRoleKey('Editor')).toBe(false);
    expect(isValidRoleKey('-editor')).toBe(false);
    expect(isValidRoleKey('ed itor')).toBe(false);
    expect(isValidRoleKey('')).toBe(false);
    expect(isValidRoleKey('x'.repeat(65))).toBe(false);
  });

  it('系统保留 key 拒占（ensure 独占面·大小写不逃逸）', () => {
    for (const key of ['owner', 'admin', 'member']) {
      expect(isReservedRoleKey(key)).toBe(true);
      expect(isValidRoleKey(key)).toBe(false);
    }
  });
});

describe('isValidGrantConditions（平铺等值白名单·S1 期）', () => {
  it('原始量等值过闸（含 {{userId}} 模板串）', () => {
    expect(isValidGrantConditions({ ownerId: '{{userId}}' })).toBe(true);
    expect(isValidGrantConditions({ workspaceId: 'w1', archived: false })).toBe(true);
    expect(isValidGrantConditions({ deletedAt: null })).toBe(true);
    expect(isValidGrantConditions({ n: 42 })).toBe(true);
  });

  it('白名单外形状全拒：空对象/数组/null/嵌套运算符/原始量本体', () => {
    expect(isValidGrantConditions({})).toBe(false);
    expect(isValidGrantConditions([])).toBe(false);
    expect(isValidGrantConditions(null)).toBe(false);
    expect(isValidGrantConditions(undefined)).toBe(false);
    expect(isValidGrantConditions('ownerId')).toBe(false);
    expect(isValidGrantConditions({ $field: 'x' })).toBe(false);
    expect(isValidGrantConditions({ a: { nested: 1 } })).toBe(false);
  });

  // query 级片 v0.2.0·人裁①：$in 白名单已放宽放行（与读侧 instance-predicate 同 grammar）。
  it('$in 多值过闸（含 {{userId}} 模板元素）', () => {
    expect(isValidGrantConditions({ ownerId: { $in: ['u1', 'u2'] } })).toBe(true);
    expect(isValidGrantConditions({ ownerId: '{{userId}}' })).toBe(true);
    expect(isValidGrantConditions({ role: { $in: ['{{userId}}', 'admin'] } })).toBe(true);
    expect(isValidGrantConditions({ n: { $in: [1, 2] } })).toBe(true);
  });

  it('$in 之外与非规范形仍拒', () => {
    // 其它 mongo 运算符
    expect(isValidGrantConditions({ n: { $gt: 1 } })).toBe(false);
    // 直接数组值
    expect(isValidGrantConditions({ tags: ['a', 'b'] })).toBe(false);
    // 空 $in
    expect(isValidGrantConditions({ role: { $in: [] } })).toBe(false);
    // $in 元素非原始量
    expect(isValidGrantConditions({ role: { $in: [{ x: 1 }] } })).toBe(false);
    // 多键嵌套
    expect(isValidGrantConditions({ a: { $in: ['x'], $gt: 1 } })).toBe(false);
  });
});

describe('canonicalConditions（键序稳定的等值口径）', () => {
  it('null → "null"；键序不同等值同串', () => {
    expect(canonicalConditions(null)).toBe('null');
    expect(canonicalConditions({ b: 1, a: '{{userId}}' })).toBe(
      canonicalConditions({ a: '{{userId}}', b: 1 }),
    );
    expect(canonicalConditions({ a: 1 })).not.toBe(canonicalConditions({ a: 2 }));
  });
});
