import { describe, expect, it } from 'vitest';
import { extractStoryRefs, findMissing } from './verify-stories-drift';

// stories-drift 恒等闸的纯核自测：提取（正/负两态·锚定不误纳路由串/目录/事件名/代码片段）+ 断链判定（含豁免）。

describe('extractStoryRefs — 溯源引用提取', () => {
  it('正态：plan 链接 / .ts 文件名（裸名 + 带路径取 basename）/ wire 码 / 符号 皆入集', () => {
    const md =
      '关联 [`x`](../plans/global-tenancy.md) · `OrganizationsController.apply`（`organizations.controller.ts`）· ' +
      '源 `libs/core/src/tenant-isolation/organization-lifecycle.ts` · wire 值 `ISOLATION:NO_ACTIVE_CONTEXT` · 码 `USER:NOT_FOUND` · ' +
      '命令 `SubmitOrganizationApplicationCommand` → `MikroOrganizationProvisioningRepository.submit`。';
    const r = extractStoryRefs(md);
    expect(r.planLinks).toEqual(['global-tenancy.md']);
    expect(r.tsFiles).toEqual(['organizations.controller.ts', 'organization-lifecycle.ts']);
    expect(r.wireCodes).toEqual(['ISOLATION:NO_ACTIVE_CONTEXT', 'USER:NOT_FOUND']);
    expect(r.symbols).toEqual([
      'OrganizationsController',
      'SubmitOrganizationApplicationCommand',
      'MikroOrganizationProvisioningRepository',
    ]);
  });

  it('负态：路由串 / 目录 / 小写点分事件名 / 含空格冒号代码片段 / 类方法 皆不误纳', () => {
    const md =
      '`POST /api/v1/organizations/applications` · `libs/core/src/tenancy`（目录无 .ts）· `user.registered`（点分小写）· ' +
      '`em.upsert(Tenant,{status:PENDING})`（含空格）· `!tenantId → 403` · ';
    const r = extractStoryRefs(md);
    expect(r.tsFiles).toEqual([]);
    expect(r.wireCodes).toEqual([]);
  });

  it('符号负态：全大写常量 / 缩写 / UPPER_SNAKE 码键 / 非后缀驼峰 皆不纳入符号档', () => {
    const md =
      '`TRANSITIONS`（全大写 const）· `PIPL` / `FK` / `S4`（缩写）· `ORG_PROVISIONING_NOT_FOUND`（下划线码键）· ' +
      '`Tenant`（无角色后缀）· `pending_approval`（小写）';
    expect(extractStoryRefs(md).symbols).toEqual([]);
  });

  it('符号正态：仅以角色后缀收尾者入集·且剔重', () => {
    const r = extractStoryRefs(
      '`TenantIsolationGuard` · `ApproveOrganizationCommand` · `tenant.rejected` 事件 `OrganizationRejectedEvent` · `TenantIsolationGuard`',
    );
    expect(r.symbols).toEqual([
      'TenantIsolationGuard',
      'ApproveOrganizationCommand',
      'OrganizationRejectedEvent',
    ]);
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

  it('符号档：传入自定义 allowlist 时同名外部类豁免、其余仍判', () => {
    const allow = new Set(['ExternalThing']);
    expect(findMissing(['ExternalThing', 'GoneThing'], new Set<string>(), allow)).toEqual([
      'GoneThing',
    ]);
  });

  it('输入去重后再判', () => {
    expect(findMissing(['x.md', 'x.md'], new Set<string>())).toEqual(['x.md']);
  });
});
