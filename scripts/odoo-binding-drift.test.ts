import { ORGANIZATION_ODOO_BINDING_STATUS as S } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import { describe, expect, it } from 'vitest';
import { analyzeBindingDrift, type BindingSnapshot } from './odoo-binding-drift';

/**
 * 绑定两向对拍纯逻辑单测（module-org-odoo-company-mapping 切片 C·§2.6·无 DB/无 Odoo）。
 *
 * 逐格锁裁决语义：正向仅 `ready` 且公司缺席才判悬空（中间态不误报）；反向孤儿按「无绑定引用」计（含 failed/
 * provisioning 的引用仍算已认领·不误报孤儿）。I/O 半（取两侧事实）归 CLI 壳·联调窗真跑对拍。
 */
const b = (
  organizationId: string,
  odooCompanyId: number | null,
  odooBindingStatus: string | null,
): BindingSnapshot => ({ organizationId, odooCompanyId, odooBindingStatus });

describe('analyzeBindingDrift', () => {
  it('①ready ∧ 公司在册 → 无悬空无孤儿（一致态）', () => {
    const report = analyzeBindingDrift([b('org-1', 10, S.READY)], [10]);
    expect(report.danglingBindings).toEqual([]);
    expect(report.orphanCompanyIds).toEqual([]);
  });

  it('②ready ∧ 公司缺席 → 悬空绑定必报（携 org + companyId）', () => {
    const report = analyzeBindingDrift([b('org-1', 10, S.READY)], []);
    expect(report.danglingBindings).toEqual([{ organizationId: 'org-1', odooCompanyId: 10 }]);
  });

  it('③pending/provisioning/failed ∧ 公司缺席 → 不误报悬空（正当中间态）', () => {
    const report = analyzeBindingDrift(
      [b('org-p', 11, S.PENDING), b('org-pr', 12, S.PROVISIONING), b('org-f', 13, S.FAILED)],
      [],
    );
    expect(report.danglingBindings).toEqual([]);
  });

  it('④未绑定行（companyId=null）→ 不参与对拍（既不悬空也不认领）', () => {
    const report = analyzeBindingDrift([b('org-none', null, null)], []);
    expect(report.danglingBindings).toEqual([]);
    expect(report.orphanCompanyIds).toEqual([]);
  });

  it('⑤在册公司无任何绑定引用 → 孤儿（仅告警·升序稳定）', () => {
    const report = analyzeBindingDrift([b('org-1', 10, S.READY)], [10, 3, 7]);
    expect(report.danglingBindings).toEqual([]);
    expect(report.orphanCompanyIds).toEqual([3, 7]);
  });

  it('⑥failed 绑定仍“认领”其公司 id → 反向不误报该公司为孤儿', () => {
    const report = analyzeBindingDrift([b('org-1', 10, S.FAILED)], [10]);
    expect(report.orphanCompanyIds).toEqual([]);
  });

  it('⑦混合矩阵：ready 悬空 + ready 在册 + 孤儿 + 未绑定 同时成立', () => {
    const report = analyzeBindingDrift(
      [
        b('org-dangling', 20, S.READY), // 悬空
        b('org-ok', 21, S.READY), // 一致
        b('org-none', null, null), // 未绑定
      ],
      [21, 99], // 21 在册；99 孤儿；20 缺席
    );
    expect(report.danglingBindings).toEqual([
      { organizationId: 'org-dangling', odooCompanyId: 20 },
    ]);
    expect(report.orphanCompanyIds).toEqual([99]);
  });
});
