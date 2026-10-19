# 会话旁路路径段对齐匹配（tenancy）

> 适用范围: `模块(tenancy·auth 会话读取)` ← 仅 `AuthSessionReader.read` 廉价旁路判据
> 关联: 外部评审报告 🟡「`url.includes('/auth')` 子串短路地雷」· `auth.constant.ts`（`AUTH_BYPASS_PATHS`）· `p1b-session-adapters.test.ts`
> 性质: 定点修复（非重写）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

`apps/api/src/tenancy/infrastructure/auth-session.reader.ts:59-68` 的旁路短路用**子串匹配**：

```ts
AUTH_BYPASS_PATHS.some((p) => url.includes(p)) || url.includes('/auth')
```

`url` = 原始请求 url（含 query）。地雷：任何**路径含 `/auth` 子串**或 **query 携带 `/auth`** 的业务路由（如 `/api/v1/authors`、`?redirect=/auth/x`）会误命中旁路 → 跳过会话解析 → `AuthSessionReader` 返回 null → 下游 `TenantScopeGuard` fail-closed 误伤 403。方向虽安全（fail-closed），但是静默误杀的 latent bug。

**目标**：把子串匹配改为**去 query/hash 后的完整路径段对齐匹配**——needle 须按段边界命中（`auth` 段匹配 `/api/v1/auth/*`，但不匹配 `/api/v1/authors`；query 不参与）。

**非目标**：不改旁路语义集（哪些路径旁路不变）；不动 BA 挂载路径；不动 `AUTH_BYPASS_PATHS` 成员内容（仅改匹配算法）；不改 core 端口契约。

## 2. 方案

- 新增纯函数 `pathSegmentMatch(url: string, needle: string): boolean`（就近置于 reader 内）：
  1. `url.split(/[?#]/, 1)[0]` 剥 query/hash；
  2. 按 `/` 切段去空；needle 亦切段；
  3. needle 段序列**连续且段边界对齐**出现在路径段中才返回 true（否则 false）。
- `auth.constant.ts` 增 `AUTH_SURFACE_PATH = '/auth'`（单一真源描述 BA 挂载段，注释锚定 `auth.implement` basePath `/${apiPrefix}/v1/auth`），替换 reader 内裸串 `'/auth'`。
- 旁路判据改为：`AUTH_BYPASS_PATHS.some((p) => pathSegmentMatch(url, p)) || pathSegmentMatch(url, AUTH_SURFACE_PATH)`。
- **完成判据**：`/api/v1/auth/login` 旁路；`/api/v1/authors` **不**旁路；`/api/v1/posts?next=/auth` **不**旁路；`/api/v1/health` 旁路。

## 3. 影响面与风险

- **blast radius**：单文件 `auth-session.reader.ts` + 一处常量 + 测试。**局部可逆**（git revert）。
- **高危清单**：不命中（无 DB 迁移 / 无删依赖 / 无改门禁·CI·宪法·env·密钥）→ 轻量自审。
- **风险**：新匹配比旧子串**更严格**（`/healthz` 类不再被 `/health` 误命中）——语义上更正确，无现存此类路由；BA 各面（登录/callback/session）均在 `auth` 段下，旁路行为与旧一致。

## 4. 审计记录

- 结论：段对齐匹配消除子串地雷，保持旁路语义集不变，附回归测锁 `/authors`·query 两类误伤。
- 未决项：无。
- 审计人 / 日期：用户「你自行裁定」授权 · 2026-10-19

## 5. 完成判据（可核验 + 穷尽）

- [ ] reader 无 `url.includes('/auth')` 与 `url.includes(p)` 子串判据。
- [ ] `p1b-session-adapters.test.ts` 补 `/api/v1/auth/*` 旁路 + `/api/v1/authors` 不旁路 + query `/auth` 不旁路 断言，全绿。
- [ ] `pnpm run ci`（check → build → test）全绿。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版 |

---

<!-- 变更戳 -->
正文已于 2026-10-19 / v0.1.0 变更，以当前正文内容为准。
