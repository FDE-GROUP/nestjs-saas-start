# CORS 白名单化（凭证兼容回显）

> 适用范围: `模块(common·配置面)` ← 触及生产配置 `envs/*` + `main.ts` 注册点 + BA `trustedOrigins` 消费点
> 关联: 外部评审报告「必须修 🔴-1」· `config.module.ts`（Joi `ALLOWED_ORIGINS`）· `auth.implement.ts`（BA `trustedOrigins`）
> 性质: 定点修复（非重写）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**现状（实机取证）**：`envs/default.ts:24-29`、`envs/development.ts:21-26`、`envs/production.ts:21-26` 三份 `cors.origin` 均硬编码 `'*'` 且 `credentials: true`；`main.ts:96-100` 直接把这份配置 `register(fastifyCors, { ...getCorsConfig() })`。`origin:'*'`+`credentials:true` 违反 CORS 凭证语义（浏览器拒绝对通配源携带 cookie），且 `cors.origin` 还被 `auth.implement.ts:151-153` 喂给 Better Auth `trustedOrigins`（当前 = `['*']`，BA origin 校验同样失守）。

同时存在**孤儿键漂移**：`config.module.ts:22` 的 `ALLOWED_ORIGINS` 为 Joi 必填，其唯一落点 `default.ts:21` 的 `auth.betterAuth.allowed_origins` **无任何消费者**（`AuthConfig` 接口未声明 `betterAuth`）——即"要求配但没在用"。

**目标**：把 `cors.origin` 改为**从环境变量读取的白名单**，在 `main.ts` 以**函数式回显**兼容凭证（命中白名单则回显具体 origin + `Access-Control-Allow-Credentials`，否则不发头），三份 env 口径统一；生产无配置时 **fail-closed**（拒所有跨源，同源不受影响）。

**非目标**：不动 BA 认证/授权逻辑；不改 `credentials`/`methods`；不清理 `auth.betterAuth.allowed_origins` 孤儿块（另议，本片不复用其语义）；不触碰 `.env` 真实值（高危·归运维）。

## 2. 方案

**键位裁定（反双 SSOT）**：复用**已存在且已 Joi 必填**的 `ALLOWED_ORIGINS` 作为唯一白名单源，而非新增 `CORS_ALLOWED_ORIGINS`——后者会与前者形成两个语义重叠的 origin 键（正是本仓"配置四角对拍"要防的漂移）。`ALLOWED_ORIGINS` 由"孤儿"转为"真正驱动 CORS 墙 + BA trustedOrigins"的实消费键。格式收敛为**逗号分隔的完整 origin**（含 scheme，如 `http://localhost:5173`）。

- **切片 A｜解析器 + env 白名单化**
  - 新增 `apps/api/src/config/envs/cors-origins.ts`：`parseCorsOrigins(raw, fallback?)` → 逗号切分 / trim / 去空，空集回落 `fallback`（缺省 `[]`）。
  - `default.ts`：`origin: parseCorsOrigins(process.env.ALLOWED_ORIGINS)`（`[]` 缺省）。
  - `development.ts`：`origin: parseCorsOrigins(process.env.ALLOWED_ORIGINS, ['http://localhost:5173','http://127.0.0.1:5173','http://localhost:7009'])`（开箱可用）。
  - `production.ts`：`origin: parseCorsOrigins(process.env.ALLOWED_ORIGINS)`（无配置 = `[]` = fail-closed）。
  - `CorsConfig.origin` 类型 `string | string[]` 保持不变（数组即满足），无接口改动。
  - 完成判据：三份 env 无 `origin: '*'` 字面量。

- **切片 B｜main.ts 函数式回显**
  - 取 `const corsConfig = configService.getCorsConfig()`，构造 `Set` 白名单；`register(fastifyCors, { ...corsConfig, origin: (origin, cb) => ... })`：无 `Origin` 头（同源/服务端）→ 放行；命中白名单或含 `'*'` → `cb(null,true)` 回显；否则 `cb(null,false)` 拒绝。`credentials:true` 下 @fastify/cors 回显具体 origin 而非 `*`，兼容凭证。
  - 完成判据：非白名单跨源无 `Access-Control-Allow-Origin`；白名单源回显自身 + `ACAC: true`。

- **切片 C｜BA 消费点核对 + 回归测**
  - BA `trustedOrigins` 走 `Array.isArray(corsConfig.origin)` 分支 → 自动获得白名单数组（替代旧 `['*']`），无需改动 `auth.implement.ts`。
  - 新增单测：`cors-origins.test.ts`（切分/trim/去空/fallback 纯函数）；`cors-whitelist.contract.test.ts`（断言 default/dev/prod 三份 env `cors.origin` 非 `'*'` 字面量，锁存量回归）。
  - `.env.example` 更新 `ALLOWED_ORIGINS` 为完整 origin 示例并注释"CORS + BA trustedOrigins 单一白名单源"。

## 3. 影响面与风险

- **blast radius**：`config/envs/{default,development,production}.ts` + `main.ts` + `.env.example`；BA `trustedOrigins` 行为随 `cors.origin` 从 `['*']` 收敛为白名单（正向）。**可逆**（git revert）。
- **命中高危清单**：属"生产配置 / 公共契约（cors 配置形态）"——**已由用户当前指令签核**（本次即授权修复）；不动 `.env` 真实凭证、不触 DB 迁移、不改门禁/CI/husky/Biome。
- **风险点**：
  1. 生产若未配 `ALLOWED_ORIGINS` → 跨源全拒（同源/前后端同域反代不受影响）；跨域前端需运维显式配置——**故意 fail-closed**，plan 与 `.env.example` 注释说明。
  2. 旧 `.env` 值 `localhost:*,127.0.0.1,localhost:7009` 是 host 模式（无 scheme），精确匹配下不命中浏览器实际 `Origin`（如 `http://localhost:7009`）→ dev 依赖 `development.ts` 的 localhost 兜底数组仍可用；生产需按完整 origin 重配（`.env.example` 已示范）。

## 4. 审计记录

- 结论：复用 `ALLOWED_ORIGINS`（非新增键）+ 函数式回显 + 生产 fail-closed，取最小 blast radius 修复评审 🔴-1 并顺带修 BA `trustedOrigins='*'` 与孤儿键漂移。
- 未决项：`auth.betterAuth.allowed_origins` 孤儿块是否后续删除（本片不动）。
- 审计人 / 日期：用户当前指令授权 · 2026-10-19

## 5. 完成判据（可核验 + 穷尽）

- [ ] 三份 env 无 `origin: '*'`；`cors.origin` 来自 `parseCorsOrigins(ALLOWED_ORIGINS)`。
- [ ] `main.ts` 以函数回显注册 fastifyCors，保留 `exposedHeaders: ['x-request-id']`。
- [ ] `pnpm run ci`（check → build → test）全绿；新增单测通过；存量 `config.service.test.ts` / BA mock 测不受损。
- [ ] `.env.example` 注释更新；`.env` 真实值未改动。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-19 | 0.1.0 | 起草 | 首版 |

---

<!-- 变更戳 -->
正文已于 2026-10-19 / v0.1.0 变更，以当前正文内容为准。
