import { buildScopedAbility } from '@app/modules/authorization/infrastructure/casl-ability.factory';
import type {
  AuthorizationAction,
  AuthorizationSubject,
} from '@core/saas-kit/authorization/authorization-rules';
import { describe, expect, it } from 'vitest';
import { SYSTEM_ROLE_SEED, type SystemRoleSeed } from './system-role-seed';

/**
 * seed 死数据 ↔ 旧 TENANT_RULES 矩阵**逐格对拍**锁测（module-rbac-dynamic-roles §5 DoD·S1）。
 *
 * 丙裁「全 DB 化删代码表」的「迁移不丢权限」验收锚：旧矩阵（2026-10-17 CASL 片删除前
 * 原样）硬编码于本测作对拍基准，seed 投影出的 ability 必须逐格一致——一次性锁（seed 落库
 * 后旧矩阵不复存在，本测即其墓碑）。Role/RoleGrant 扩格为新增职权（§2.5），不在对拍域。
 */

/** 旧 `TENANT_RULES` 矩阵原样（删除前快照·对拍基准·非运行时消费物）。 */
const OLD_MATRIX: Readonly<
  Record<string, Readonly<Partial<Record<AuthorizationSubject, readonly AuthorizationAction[]>>>>
> = {
  owner: {
    Organization: ['update', 'delete'],
    Member: ['read', 'update', 'delete'],
    Invitation: ['read', 'create', 'cancel'],
    Workspace: ['create', 'read', 'update', 'delete'],
  },
  admin: {
    Organization: ['update'],
    Member: ['read', 'update', 'delete'],
    Invitation: ['read', 'create', 'cancel'],
    Workspace: ['create', 'read', 'update', 'delete'],
  },
  member: {
    Organization: [],
    Member: ['read'],
    Invitation: ['read'],
    Workspace: ['read'],
  },
};

const LEGACY_SUBJECTS: AuthorizationSubject[] = [
  'Organization',
  'Member',
  'Invitation',
  'Workspace',
];
const ACTION_VALUES: AuthorizationAction[] = ['create', 'read', 'update', 'delete', 'cancel'];

function seedFor(key: string): SystemRoleSeed {
  const seed = SYSTEM_ROLE_SEED.find((s) => s.key === key);
  if (!seed) throw new Error(`seed 缺系统角色 ${key}`);
  return seed;
}

describe('SYSTEM_ROLE_SEED ↔ 旧 TENANT_RULES 逐格对拍（一次性验收锚）', () => {
  for (const role of Object.keys(OLD_MATRIX)) {
    it(`${role}：seed 投影与旧矩阵在四 legacy subject 上逐格一致（表内 can·表外 cannot）`, () => {
      const ability = buildScopedAbility(
        seedFor(role).grants.flatMap((g) =>
          g.actions.map((action) => ({ subject: g.subject, action })),
        ),
      );
      for (const subject of LEGACY_SUBJECTS) {
        const allowed = OLD_MATRIX[role]?.[subject] ?? [];
        for (const action of ACTION_VALUES) {
          expect(ability.can(action, subject), `${role} ${action} ${subject}`).toBe(
            allowed.includes(action),
          );
        }
      }
    });
  }

  it('seed 键集 = 系统三 key（无多余角色·自定义角色只能经 DB 行入）', () => {
    expect(SYSTEM_ROLE_SEED.map((s) => s.key)).toEqual(['owner', 'admin', 'member']);
  });

  it('新增职权扩格锁：Role/RoleGrant 管理权仅 owner/admin（member 不可见·§2.5）', () => {
    const member = seedFor('member');
    expect(member.grants.some((g) => g.subject === 'Role' || g.subject === 'RoleGrant')).toBe(
      false,
    );
    for (const key of ['owner', 'admin']) {
      const grants = seedFor(key).grants;
      expect(grants.some((g) => g.subject === 'Role' && g.actions.includes('create'))).toBe(true);
      expect(grants.some((g) => g.subject === 'RoleGrant' && g.actions.includes('create'))).toBe(
        true,
      );
    }
  });

  it('seed 全部行零 conditions（系统角色为整 subject 级·实例级仅来自自定义 grant·S4）', () => {
    for (const seed of SYSTEM_ROLE_SEED) {
      for (const grant of seed.grants) {
        expect('conditions' in grant).toBe(false);
      }
    }
  });
});
