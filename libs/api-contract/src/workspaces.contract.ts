/**
 * workspaces 域 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 工作区 CRUD 参考切片（offset 分页列表 + 创建/更新/删除）。契约携 zod 输入/输出
 * （`@saas/contracts` 单源）+ `openapi` meta（meta 与 apps/api `os` server procedure 共享同物体）。
 * `:id` 路径参经紧凑 input 结构平并到合并 input schema。守卫墙（TenantIsolation+Authorization+@Can）
 * 与 in-handler NotFoundException（WORKSPACE_NOT_FOUND·WP-D 承接）留 apps/api。`successStatus` 数值字面量。
 */
import {
  createWorkspaceSchema,
  listPageQuerySchema,
  updateWorkspaceInputSchema,
  workspaceIdParamSchema,
  workspacePageSchema,
  workspaceViewSchema,
} from '@saas/contracts/index';
import { oc, openapi } from './base';

export const workspacesListMeta = openapi({
  method: 'GET',
  path: '/workspaces',
  summary: 'List workspaces in the active organization',
});
export const workspacesCreateMeta = openapi({
  method: 'POST',
  path: '/workspaces',
  successStatus: 201,
  summary: 'Create a workspace (owner/admin)',
});
export const workspacesUpdateMeta = openapi({
  method: 'PATCH',
  path: '/workspaces/:id',
  summary: 'Update a workspace (owner/admin)',
});
export const workspacesRemoveMeta = openapi({
  method: 'DELETE',
  path: '/workspaces/:id',
  successStatus: 204,
  summary: 'Delete a workspace (owner/admin)',
});

export const workspacesListContract = oc
  .input(listPageQuerySchema)
  .output(workspacePageSchema)
  .meta(workspacesListMeta);

export const workspacesCreateContract = oc
  .input(createWorkspaceSchema)
  .output(workspaceViewSchema)
  .meta(workspacesCreateMeta);

export const workspacesUpdateContract = oc
  .input(updateWorkspaceInputSchema)
  .output(workspaceViewSchema)
  .meta(workspacesUpdateMeta);

export const workspacesRemoveContract = oc.input(workspaceIdParamSchema).meta(workspacesRemoveMeta);
