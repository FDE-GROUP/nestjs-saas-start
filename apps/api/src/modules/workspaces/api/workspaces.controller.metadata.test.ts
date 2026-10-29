import 'reflect-metadata';
import {
  createWorkspaceSchema,
  listPageQuerySchema,
  updateWorkspaceInputSchema,
  workspaceIdParamSchema,
  workspacePageSchema,
  workspaceViewSchema,
} from '@saas/contracts/index';
import { describe, expect, it } from 'vitest';
import {
  workspacesCreateContract,
  workspacesListContract,
  workspacesRemoveContract,
  workspacesUpdateContract,
} from './workspaces.controller';

interface SchemasDef {
  inputSchemas?: readonly unknown[];
  outputSchemas?: readonly unknown[];
}

function schemasOf(contract: object): SchemasDef {
  return (contract as { '~orpc': SchemasDef })['~orpc'];
}

// 换轨 WP-B parity：list/create 转 per-method `@Impl` 后，旧 S4 `@Query({schema})` 参数元数据与
// S7b `@SerializeOptions` 类序列化元数据换落点到 procedure 级 `.input/.output`（zod 单源不变）。
// 本测复刻旧防线本职（防漏配致校验/白名单整链静默跳过）——锁 contract 携对应 schema。
describe('WorkspacesController list/create contract parity（S4 校验 + S7b 白名单）', () => {
  it('list contract：input=listPageQuerySchema·output=workspacePageSchema（offsetPage 形状）', () => {
    const def = schemasOf(workspacesListContract);
    expect(def.inputSchemas).toContain(listPageQuerySchema);
    expect(def.outputSchemas).toContain(workspacePageSchema);
  });

  it('create contract：input=createWorkspaceSchema·output=workspaceViewSchema（单对象形状）', () => {
    const def = schemasOf(workspacesCreateContract);
    expect(def.inputSchemas).toContain(createWorkspaceSchema);
    expect(def.outputSchemas).toContain(workspaceViewSchema);
  });
});

// 换轨 WP-C：update/remove 亦转 per-method `@Impl`（路径参经合并 input schema·出线经 .output）。
// 旧 S4 `@Body({schema})` 参数校验与 S7b `@SerializeOptions` 序列化白名单换落点到 procedure 级
// `.input/.output`（zod 单源不变）·本测锁 update/remove contract 携对应 schema（含 :id 路径参）。
describe('WorkspacesController update/remove contract parity（S4 校验 + S7b 白名单·含 :id 路径参）', () => {
  it('update contract：input=updateWorkspaceInputSchema（body ⊕ id）·output=workspaceViewSchema', () => {
    const def = schemasOf(workspacesUpdateContract);
    expect(def.inputSchemas).toContain(updateWorkspaceInputSchema);
    expect(def.outputSchemas).toContain(workspaceViewSchema);
  });

  it('remove contract：input=workspaceIdParamSchema（携 id）·void 出线不挂 output', () => {
    const def = schemasOf(workspacesRemoveContract);
    expect(def.inputSchemas).toContain(workspaceIdParamSchema);
    expect(def.outputSchemas ?? []).not.toContain(workspaceViewSchema);
  });
});
