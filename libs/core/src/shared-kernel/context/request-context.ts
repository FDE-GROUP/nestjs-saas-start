import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 每请求关联上下文（module-common-request-correlation）。
 *
 * @remarks
 * 与 tenantIsolationStorage 分store 独立（乙裁）：request id 与租户无关，且必须覆盖
 * /health 等旁路面——不随租户墙的生命周期走。
 * 落 shared-kernel 是依赖方向硬约束：libs/core 内的事件构造点
 * （tenant-status / user-status service）也要读源，holder 放 apps/api 即违反
 * S10 不变量（core 零反向 import `@app/*`）。纯 node 零框架依赖。
 *
 * @public
 */
export interface RequestContext {
  /** 请求关联 id。 */
  readonly requestId: string;
}

/**
 * 请求上下文 ALS store（供装配根 `requestStorage.run(...)` 注入 requestId）。
 *
 * @public
 */
export const requestStorage = new AsyncLocalStorage<RequestContext>();

/**
 * 任意深度读当前请求 id。
 *
 * @returns 当前请求的 `requestId`；请求上下文之外（后台任务/测试）返回 `undefined`
 * @public
 */
export function currentRequestId(): string | undefined {
  return requestStorage.getStore()?.requestId;
}
