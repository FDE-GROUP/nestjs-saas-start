import { createRpcClient } from '@saas/api-client';

/**
 * 后端 Nest 面 typed 客户端单例（F2 · module-frontend-organization-console §2.1）。
 *
 * 同源相对：路径自带 `/api/v1` 前缀；dev 经 `vite.config.ts` 的 `/api` 反代至 :7009（okee 同源
 * 约定），生产同域反代下零绝对 URL。会话/凭据：`credentials:'same-origin'`（link 内已置），
 * Cookie + DB Session 与后端同向。
 *
 * 【换轨 B-6c】全路由已切 typed oRPC `rpc`（型锚从 `@saas/api-contract`·成功拆信封/错误抛
 * `ORPCError`·客户端 reviving Date）。旧 `api`（openapi-fetch）/`client.ts`/`schema.d.ts` 随 B-7 退役。
 *
 * multipart 例外：存储上传走原生 fetch（见 `./upload.ts`）·Better Auth 面走 `./auth.ts` 裸 fetch。
 */
export const rpc = createRpcClient();
