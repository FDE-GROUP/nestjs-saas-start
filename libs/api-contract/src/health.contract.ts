/**
 * health 域 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约前置）。
 *
 * @remarks
 * 存活探针 `/api/v1/health`：`openapi.path`（相对段 `/health`）与 Nest 全局前缀（`api`）+ URI 版本化
 * （`v1`）合成最终路径，与旧 REST 面逐字节一致。ping-only：无 input；M4-b 挂 `.output`
 * （`healthCheckResultViewSchema`·terminus 结果体顶层骨架）→文档/型契约面；@Impl 双侧同挂→handler `check` 真跑 parse。
 * 本文件是**契约定义单源**——apps/api `health.controller` 反向 import 后 `@Impl` 挂载、handler 仍留 apps/api。
 */
import { healthCheckResultViewSchema } from '@saas/contracts/index';
import { oc, openapi } from './base';

/** 存活探针 procedure 契约（`openapi` meta 决定路由 method+path·与键位解耦）。 */
export const healthProcedureContract = oc
  .output(healthCheckResultViewSchema)
  .meta(openapi({ method: 'GET', path: '/health', summary: 'Liveness probe (ping-only)' }));

/** health 子路由契约（`@Impl` 挂载单元·键 `check`）。 */
export const healthContract = oc.router({ check: healthProcedureContract });
