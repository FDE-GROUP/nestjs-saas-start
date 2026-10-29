/**
 * `@saas/api-contract` 内部基座——契约构造根单源（供各域 `<domain>.contract.ts` 与本包 barrel 消费）。
 *
 * @remarks
 * 与 `apps/api` 的 `common/orpc/orpc.ts` 之 `oc` 同源（皆 `@orpc/contract` 的 `oc`），
 * 故本包派生的 `ProcedureContract` 与 apps/api 侧 `@Impl(contract)` 期望的契约型**逐字节等价**；
 * `os`（含 `restErrorMiddleware` 的服务端 builder）留 apps/api，不入本纯契约包。
 */
import { oc as contractOc } from '@orpc/contract';

export { openapi } from '@orpc/openapi';

/** 契约构造根（与 apps/api `common/orpc/orpc.ts` 的 `oc` 同源，即 `@orpc/contract` 的 `oc`）。 */
export const oc = contractOc;
