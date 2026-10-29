/**
 * users 域 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 用户自助面（PIPL 本人导出 / 本人删除）：无 input。导出面 M4-b 挂 `.output`（`userDataExportViewSchema`·
 * 顶层骨架·@Impl 双侧同挂→handler 真跑 parse·内层 free-form 不剥）；删除面 `successStatus` 204。已认证主体经 `context.user`（handler 留 apps/api）。`successStatus` 用数值
 * 字面量（204·承 `HttpStatus.NO_CONTENT`），免纯契约包引 `@nestjs/common`。
 */
import { userDataExportViewSchema } from '@saas/contracts/index';
import { oc, openapi } from './base';

export const usersExportMeta = openapi({
  method: 'GET',
  path: '/users/me/data-export',
  summary: 'PIPL right-to-access: export current user personal data (C1 · FR-7)',
});
export const usersDeleteMeta = openapi({
  method: 'DELETE',
  path: '/users/me',
  successStatus: 204,
  summary: 'PIPL right-to-erase: hard-delete current user (C1 · FR-7)',
});

export const usersExportContract = oc.output(userDataExportViewSchema).meta(usersExportMeta);
export const usersDeleteContract = oc.meta(usersDeleteMeta);
