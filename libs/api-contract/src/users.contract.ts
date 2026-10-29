/**
 * users 域 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 用户自助面（PIPL 本人导出 / 本人删除）：无 input、output passthrough（不挂 `.output`·逐字保真），
 * 契约只携 `openapi` meta。已认证主体经 `context.user`（handler 留 apps/api）。`successStatus` 用数值
 * 字面量（204·承 `HttpStatus.NO_CONTENT`），免纯契约包引 `@nestjs/common`。
 */
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

export const usersExportContract = oc.meta(usersExportMeta);
export const usersDeleteContract = oc.meta(usersDeleteMeta);
