import { describe, expect, it } from 'vitest';
import { extractStoryRefs, findMissing } from './verify-stories-drift';

// stories-drift 恒等闸的纯核自测：提取（正/负两态·锚定不误纳路由串/目录/事件名/代码片段）+ 断链判定（含豁免）。

describe('extractStoryRefs — 溯源引用提取', () => {
  it('正态：plan 链接 / .ts 文件名（裸名 + 带路径取 basename）/ wire 码 皆入集', () => {
    const md =
      '关联 [`x`](../plans/global-tenancy.md) · `TenantsController.apply`（`tenants.controller.ts`）· ' +
      '源 `libs/core/src/tenancy/tenant-lifecycle.ts` · wire 值 `TENANCY:NO_ACTIVE_CONTEXT` · 码 `USER:NOT_FOUND`。';
    const r = extractStoryRefs(md);
    expect(r.planLinks).toEqual(['global-tenancy.md']);
    expect(r.tsFiles).toEqual(['tenants.controller.ts', 'tenant-lifecycle.ts']);
    expect(r.wireCodes).toEqual(['TENANCY:NO_ACTIVE_CONTEXT', 'USER:NOT_FOUND']);
  });

  it('负态：路由串 / 目录 / 小写点分事件名 / 含空格冒号代码片段 / 类方法 皆不误纳', () => {
    const md =
      '`POST /api/v1/tenants/applications` · `libs/core/src/tenancy`（目录无 .ts）· `user.registered`（点分小写）· ' +
      '`em.upsert(Tenant,{status:PENDING})`（含空格）· `!tenantId → 403` · `TenantsController.apply`（类方法非文件）· ' +
      '`pending_approval → active`（态迁移）· `mikro-tenant-governance.repository`（无 .ts 后缀）';
    const r = extractStoryRefs(md);
    expect(r.tsFiles).toEqual([]);
    expect(r.wireCodes).toEqual([]);
  });

  it('去重：重复引用只各留一份', () => {
    const r = extractStoryRefs('`a.ts` `a.ts` `X:Y` `X:Y`');
    expect(r.tsFiles).toEqual(['a.ts']);
    expect(r.wireCodes).toEqual(['X:Y']);
  });
});

describe('findMissing — 断链判定', () => {
  it('已知实存集内者判通过·查无者列入断链', () => {
    expect(findMissing(['a.md', 'b.md'], new Set(['a.md', 'b.md']))).toEqual([]);
    expect(findMissing(['a.md', 'gone.md'], new Set(['a.md']))).toEqual(['gone.md']);
  });

  it('wire 码元示例占位符 NAMESPACE:NAME 即便不在实存集亦豁免不判', () => {
    expect(
      findMissing(['NAMESPACE:NAME', 'USER:NOT_FOUND'], new Set<string>(['USER:NOT_FOUND'])),
    ).toEqual([]);
  });

  it('输入去重后再判', () => {
    expect(findMissing(['x.md', 'x.md'], new Set<string>())).toEqual(['x.md']);
  });
});
