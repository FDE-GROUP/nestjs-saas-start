import { describe, expect, it } from 'vitest';
import { CANONICAL_DOMAIN_SUBDIRS, findViolationsFromRelPaths } from './verify-domain-layout';

// domain 子目录法恒等闸的纯核自测（三向：合规零违规 / 根散件命中 / 非规范子目录命中）。
// 合成输入即真实 apps/api/*/domain 全仓归位后的形态（见 docs/research/fc-kernel-inventory.md）。
describe('findViolationsFromRelPaths — domain 子目录法恒等闸', () => {
  it('① canonical 子目录件（含更深嵌套、含测试共位）零违规', () => {
    const rels = [
      'entities/post.ts',
      'value-objects/quota.vo.ts',
      'events/subscription-activated.event.ts',
      'repositories/tenant.repository.ts',
      'ports/storage.port.ts',
      'policies/rbac.policy.ts',
      'policies/rbac.policy.test.ts',
      'constants/system-role-seed.ts',
      'value-objects/nested/deeper.ts',
    ];
    expect(findViolationsFromRelPaths(rels)).toEqual([]);
  });

  it('② 躺 domain 根的散件（业务件与裸测试皆）命中', () => {
    const v = findViolationsFromRelPaths(['foo.ts', 'stray.test.ts', 'upload-policy.ts']);
    expect(v).toEqual(['foo.ts', 'stray.test.ts', 'upload-policy.ts']);
  });

  it('③ 非规范子目录命中', () => {
    const v = findViolationsFromRelPaths(['services/z.ts', 'helpers/a.ts', 'dto/b.ts']);
    expect(v).toEqual(['services/z.ts', 'helpers/a.ts', 'dto/b.ts']);
  });

  it('canonical 集与宪法七子目录恒等（漂移守卫）', () => {
    expect([...CANONICAL_DOMAIN_SUBDIRS].sort()).toEqual([
      'constants',
      'entities',
      'events',
      'policies',
      'ports',
      'repositories',
      'value-objects',
    ]);
  });
});
