import { describe, expect, it } from 'vitest';
import {
  type CommentUnit,
  extractCommentUnits,
  findViolations,
  OVERTURNED_RULINGS,
} from './verify-overturned-rulings';

// 「已推翻裁定」注释闸纯核自测（三向对拍蓝本·镜像 verify-domain-layout.test.ts）。
// 覆盖：现态断言命中 / 框定豁免 / 跨块豁免 / wire 字符串双防线 / 注释内事件名前瞻放行 / 裁定间豁免面隔离。

const unit = (text: string, startLine = 1): CommentUnit => ({ text, startLine });

describe('extractCommentUnits — 只抽注释·跳字符串', () => {
  it('字符串字面量内的 token 不被当注释抽出（wire 值防线·代码侧）', () => {
    const src = `const x = 'tenant.status.transitioned';\n// 状态存 tenant.status 真列\n`;
    const units = extractCommentUnits(src);
    // 仅行注释一条，且不含那句字符串赋值。
    expect(units).toHaveLength(1);
    expect(units[0]?.text).toContain('状态存 tenant.status 真列');
  });

  it('块注释整块收为一单元（含内部换行）', () => {
    const src = `/**\n * 第一行\n * 第二行 户籍\n */\nexport const a = 1;`;
    const units = extractCommentUnits(src);
    expect(units).toHaveLength(1);
    expect(units[0]?.text).toContain('户籍');
    expect(units[0]?.text).toContain('第一行');
  });
});

describe('findViolations — 失实现态断言拦截 + 框定豁免', () => {
  it('① 无框定词的现态断言 → 违规', () => {
    const v = findViolations('f.ts', [unit(' 状态存 tenant.status 真列·唯一真相源')]);
    expect(v).toHaveLength(1);
    expect(v[0]?.plan).toBe('global-tenant-entity-reclamation');
  });

  it('② 同行带历史框定词 → 豁免', () => {
    const v = findViolations('f.ts', [
      unit(' 原 tenant.status 旁表已归位 organization.status 真列'),
    ]);
    expect(v).toEqual([]);
  });

  it('③ 框定词与 token 跨物理行但在同一注释块 → 仍豁免（按块判定实证）', () => {
    const v = findViolations('f.ts', [
      unit(' PII 边界：户籍表列实存 = id/status\n R1a 订正；旁表现已 DROP，本语义为历史快照描述'),
    ]);
    expect(v).toEqual([]);
  });

  it('④ 注释内事件名指称 tenant.status.transitioned → 前瞻放行（不误杀 wire 名）', () => {
    const v = findViolations('f.ts', [
      unit(' eventType `tenant.status.transitioned`, eventVersion 1'),
    ]);
    expect(v).toEqual([]);
  });

  it('⑤ 「organization 全栈统一」无框定 → 命中 vocabulary-pivot 反转裁定', () => {
    const v = findViolations('f.ts', [unit(' 业务命名以 organization 全栈统一·不用 tenant')]);
    expect(v).toHaveLength(1);
    expect(v[0]?.plan).toBe('global-organization-vocabulary-pivot');
  });

  it('⑥ 裁定间豁免面隔离：A 的框定词不替 B 的失实断言开脱', () => {
    // 含 odoo-mapping 反转 token「一租户一公司」，但只带 vocabulary 专属框定词「Allow」（odoo markers 不含）。
    const v = findViolations('f.ts', [unit(' 一租户一公司 Allow 面')]);
    // 「Allow」不在 odoo-mapping 裁定 markers 集内 → 应仍判违规。
    expect(v.some((x) => x.plan === 'module-org-odoo-company-mapping')).toBe(true);
  });

  it('⑦ 一租户一公司双射现态断言无框定 → 命中 odoo-company-mapping 反转裁定', () => {
    const v = findViolations('f.ts', [unit(' 一个租户绑定一个 Odoo 公司（一租户一公司双射）')]);
    expect(v).toHaveLength(1);
    expect(v[0]?.plan).toBe('module-org-odoo-company-mapping');
  });
});

describe('登记表漂移守卫', () => {
  it('当前登记五条有据反悔·supersededBy 齐备', () => {
    expect(OVERTURNED_RULINGS.map((r) => r.plan).sort()).toEqual([
      'global-organization-status-comment-sync',
      'global-organization-vocabulary-pivot',
      'global-tenancy-status-vocabulary',
      'global-tenant-entity-reclamation',
      'module-org-odoo-company-mapping',
    ]);
    for (const r of OVERTURNED_RULINGS) {
      expect(r.supersededBy).toMatch(/^global-/);
      expect(r.bannedTokens.length).toBeGreaterThan(0);
      expect(r.framingMarkers.length).toBeGreaterThan(0);
    }
  });
});
