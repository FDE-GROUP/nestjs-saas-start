import type { TenantAction, TenantSubject } from '@core/saas-kit/authorization/tenant-rules';
import { describe, expect, it } from 'vitest';
import { buildTenantAbility, type TenantAbilityGrant } from './casl-ability.factory';

/**
 * grant 行 → CASL ability 纯投影锁测（module-rbac-casl §2.5 换形 · module-rbac-dynamic-roles §2.3）。
 *
 * 旧「buildTenantAbility ↔ TENANT_RULES 逐格等价」随丙裁（矩阵删净）迁至
 * `constants/system-role-seed.test.ts`（seed ↔ 旧矩阵对拍）；本测只锁**投影机制**：
 * 行内 can、行外 cannot、conditions 匹配、空输入 fail-closed——投影不含任何权限知识。
 */

const SUBJECT_VALUES: TenantSubject[] = [
  'Organization',
  'Member',
  'Invitation',
  'Workspace',
  'Role',
  'RoleGrant',
];
const ACTION_VALUES: TenantAction[] = ['create', 'read', 'update', 'delete', 'cancel'];

function grantsOf(subject: TenantSubject, actions: readonly TenantAction[]): TenantAbilityGrant[] {
  return actions.map((action) => ({ subject, action }));
}

describe('buildTenantAbility grant 行投影', () => {
  it('行内 can、行外 cannot（多 subject 行并集·未声明组合零规则）', () => {
    const ability = buildTenantAbility([
      ...grantsOf('Workspace', ['create', 'read']),
      ...grantsOf('Member', ['read']),
    ]);
    expect(ability.can('create', 'Workspace')).toBe(true);
    expect(ability.can('read', 'Workspace')).toBe(true);
    expect(ability.can('read', 'Member')).toBe(true);
    for (const action of ACTION_VALUES) {
      if (action !== 'read') expect(ability.cannot(action, 'Member'), action).toBe(true);
      if (action !== 'create' && action !== 'read') {
        expect(ability.cannot(action, 'Workspace'), action).toBe(true);
      }
    }
    expect(ability.cannot('read', 'Organization')).toBe(true);
  });

  it('空输入投影为空规则 → 全部拒绝（fail-closed·与「查无角色」同语义）', () => {
    const ability = buildTenantAbility([]);
    for (const subject of SUBJECT_VALUES) {
      for (const action of ACTION_VALUES) {
        expect(ability.cannot(action, subject), `${action} ${subject}`).toBe(true);
      }
    }
  });

  it('conditions 行实例匹配（__caslSubjectType__ 形·CASL v7 源码对拍）：属性命中 allow、不命中 deny', () => {
    const ability = buildTenantAbility([
      { subject: 'Workspace', action: 'update', conditions: { ownerId: 'u1' } },
    ]);
    // CASL v7 实例判定口径：can(action, {__caslSubjectType__, ...attrs})（第三参对象不是合法
    // API——field 重载限 string，误传直接抛错）；S4 模板解析后守卫生成实例形即用此形。
    expect(ability.can('update', { __caslSubjectType__: 'Workspace', ownerId: 'u1' })).toBe(true);
    expect(ability.can('update', { __caslSubjectType__: 'Workspace', ownerId: 'u2' })).toBe(false);
    // 事实登记（S4 关键语义）：**类型级**判定不下推 conditions（无实例可比 → 条件规则视同放行），
    // 故带 conditions 的格必须走实例形——guard 侧「先取资源再判」的机制依据（不可用类型级偷懒）。
    expect(ability.can('update', 'Workspace')).toBe(true);
    // 未声明动作即便属性命中也拒。
    expect(ability.can('delete', { __caslSubjectType__: 'Workspace', ownerId: 'u1' })).toBe(false);
  });

  it('同格多行 = OR 并集（行式 grant 的合并语义·甲裁表形配套）', () => {
    const ability = buildTenantAbility([
      { subject: 'Workspace', action: 'update', conditions: { ownerId: 'u1' } },
      { subject: 'Workspace', action: 'update', conditions: { ownerId: 'u2' } },
    ]);
    expect(ability.can('update', { __caslSubjectType__: 'Workspace', ownerId: 'u1' })).toBe(true);
    expect(ability.can('update', { __caslSubjectType__: 'Workspace', ownerId: 'u2' })).toBe(true);
    expect(ability.can('update', { __caslSubjectType__: 'Workspace', ownerId: 'u3' })).toBe(false);
  });

  it('词汇扩项锁：Role/RoleGrant subject 可投影可判（S3 管理职权词汇就位）', () => {
    const ability = buildTenantAbility([
      ...grantsOf('Role', ['create', 'read', 'update', 'delete']),
      ...grantsOf('RoleGrant', ['create', 'read', 'delete']),
    ]);
    expect(ability.can('create', 'Role')).toBe(true);
    expect(ability.can('delete', 'RoleGrant')).toBe(true);
    expect(ability.cannot('cancel', 'Role')).toBe(true);
  });
});
