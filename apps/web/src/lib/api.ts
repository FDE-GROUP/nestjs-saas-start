import { createApiClient } from '@saas/api-client';

/**
 * 后端 Nest 面 typed 客户端单例（F2 · module-frontend-organization-console §2.1）。
 *
 * 同源相对：`DEFAULT_BASE_PATH=''`，路径自带 `/api/v1` 前缀；dev 经 `vite.config.ts` 的
 * `/api` 反代至 :7009（okee 同源约定），生产同域反代下零绝对 URL。
 * 会话/凭据：`credentials:'same-origin'`（工厂内已置），Cookie + DB Session 与后端同向。
 * 类型全从 `openapi/openapi.yaml`（SSOT）生成的 `paths` 派生（编译期契约锁定）。
 *
 * 注：Better Auth 面（sign-in/sign-out/get-session）不在 Nest OpenAPI，仍走 `./auth.ts` 裸 fetch。
 */
export const api = createApiClient();
