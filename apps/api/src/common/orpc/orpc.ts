import { oc as contractOc } from '@orpc/contract';
import { os as baseOs } from '@orpc/server';
import { restErrorMiddleware } from './rest-error.middleware';

/**
 * oRPC 装配根（换轨 WP-D）：全应用 `@Impl` procedure 的单一 `oc`/`os` 根。
 *
 * @remarks
 * - `oc`（contract 根）：路由注册 + openapi meta + 客户端型派生的契约单源，直接复用 `@orpc/contract` 的 `oc`。
 * - `os`（server 根）：**预挂 REST 错误承接中间件**（`restErrorMiddleware`）——凡经此根派生的 procedure
 *   自动获 in-handler `HttpException` → 逐字 REST 错误信封的等价承接（WP-D·与全局
 *   `customErrorResponseBodyEncoder` 协同），无需各 controller 逐处 `.use`。
 * controller 一律从本模块 import `os`/`oc`（不再裸取 `@orpc/server`/`@orpc/contract`），使错误面纪律不可绕过。
 */
export const oc = contractOc;

export const os = baseOs.use(restErrorMiddleware);
