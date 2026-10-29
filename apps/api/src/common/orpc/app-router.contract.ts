/**
 * apps/api 引用应用侧的契约树聚合——**公共客户端型锚已前置 `@saas/api-contract`**（换轨 WP-E/#2·B-4）。
 *
 * @remarks
 * - `AppRouterContract` / `appContractRouter`（**公共 56 叶·前端 `createClient` 型锚**）单源在 `@saas/api-contract`，
 *   本文件仅 re-export（api-client 与 `apps/web` 均从公共包取型锚·不再依赖 apps/api）。
 * - feature 叠加层（`mcp`·`odoo-rpc-api`·5 叶）按 feature 隔离规范 + `@ApiExcludeController` 留在 `apps/api/src/features/**`、
 *   不入公共包，故本文件另组 `FEATURE_APP_ROUTER_SPEC`，并聚合出 `APP_ROUTER_SPEC`（公共 56 + feature 5 = 61）——
 *   仅作 `app-router.contract.test.ts` 的**全量本地覆盖对拍**（防 feature 契约静默漂移），非客户端型锚。
 * - 纯 contract、零运行副作用：不引 `@orpc/server`/`@orpc/client`、不建 HTTP link（客户端接线属 WP-F 高危 #2/#3 联签范围）。
 */
import { PUBLIC_APP_ROUTER_SPEC } from '@saas/api-contract/index';
import {
  mcpListContract,
  mcpMintContract,
  mcpRevokeContract,
} from '../../features/mcp/api/mcp-credentials.controller';
import {
  odooPartnersContract,
  odooProductsContract,
} from '../../features/odoo-rpc-api/api/odoo-rpc.controller';

// 公共客户端型锚（单源 `@saas/api-contract`·re-export 保下游按本地路径取型）。
export { type AppRouterContract, appContractRouter } from '@saas/api-contract/index';

/** feature 叠加层契约树（留 apps/api·mcp 3 + odoo 2 = 5 叶·不入公共客户端型锚）。 */
export const FEATURE_APP_ROUTER_SPEC = {
  mcp: {
    credentials: {
      mint: mcpMintContract,
      list: mcpListContract,
      revoke: mcpRevokeContract,
    },
  },
  odoo: { partners: odooPartnersContract, products: odooProductsContract },
} as const;

/**
 * 引用应用全量嵌套契约树（公共 56 + feature 5 = 61 叶）——仅本地覆盖对拍消费，非客户端型派生源。
 * 叶子引用与各 controller/公共包 `*Contract` 导出恒等（controller 反向 import 同一 lib 物体）。
 */
export const APP_ROUTER_SPEC = {
  ...PUBLIC_APP_ROUTER_SPEC,
  ...FEATURE_APP_ROUTER_SPEC,
} as const;
