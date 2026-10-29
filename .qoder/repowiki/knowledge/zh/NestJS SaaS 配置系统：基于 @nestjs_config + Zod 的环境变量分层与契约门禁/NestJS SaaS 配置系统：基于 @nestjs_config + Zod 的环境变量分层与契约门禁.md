---
kind: configuration_system
name: NestJS SaaS 配置系统：基于 @nestjs/config + Zod 的环境变量分层与契约门禁
category: configuration_system
scope:
    - '**'
source_files:
    - apps/api/src/load-env.ts
    - apps/api/src/config/config.module.ts
    - apps/api/src/config/config.service.ts
    - apps/api/src/config/interfaces/config.interface.ts
    - apps/api/src/config/envs/default.ts
    - apps/api/src/config/envs/development.ts
    - apps/api/src/config/envs/production.ts
    - apps/api/src/config/envs/cors-origins.ts
    - apps/api/src/config/envs/sso-clients.ts
    - apps/api/src/config/data-residency.ts
    - .env.example
    - scripts/verify-config-contract.ts
---

## 1. 总体方案

本仓库采用 **@nestjs/config**（NestConfigModule）作为运行时配置加载器，配合 **Zod v4**（StandardSchemaV1）做环境变量校验，并以 `apps/api/src/config/` 为唯一入口。所有业务配置以 `process.env.*` 注入到纯对象字面量中，再经 Nest DI 的 `ConfigService` 暴露 typed getter；非 API 进程（seed、脚本、前端构建）通过独立的 `dotenv.config()` 直接读取 `.env`。

## 2. 关键文件

- `apps/api/src/load-env.ts` — 入口首个副作用 import，调用 `dotenv.config()`，保证 ESM 静态 import 提升后仍先于 `config/envs/*.ts` 求值（注释明确说明跨 node/bun 一致性需求）。
- `apps/api/src/config/config.module.ts` — 全局模块，注册 NestConfigModule.forRoot，声明 `validationSchema`（zod baseSchema），按 `NODE_ENV` 二选一加载 development/production 环境层。
- `apps/api/src/config/config.service.ts` — 对 NestConfigService 的薄封装，提供 `getAppConfig/getDatabaseConfig/getOAuthConfig/getStorageConfig/getStripeConfig/getPaymentConfig/getPlatformConfig/getOauthSsoConfig/getEventPublishConfig/getEsTruthSourceConfig/getSessionReclaimConfig` 等 typed getter，未命中 key 抛错。
- `apps/api/src/config/interfaces/config.interface.ts` — 配置结构 TS 类型定义（被 ConfigService 消费）。
- `apps/api/src/config/envs/default.ts` — 全环境共享默认值（app/database/auth/cors/swagger/storage/stripe/payment/eventPublish/esTruthSource/sessionReclaim/platform/oauth/oauthSso 等聚合键）。
- `apps/api/src/config/envs/development.ts` / `production.ts` — 环境覆盖层（dev 放宽 CORS origin 白名单并开启 swagger；prod 关闭 swagger、fail-closed CORS）。
- `apps/api/src/config/envs/cors-origins.ts` / `sso-clients.ts` — 解析辅助函数（逗号分隔 origin、JSON 数组 SSO client 注册表）。
- `apps/api/src/config/data-residency.ts` — 数据驻留守卫（DATA_RESIDENCY_ENFORCE/DATA_RESIDENCY_DB_HOST_ALLOWLIST）。
- `.env.example` — 全部可配环境变量清单（含注释态占位），是 verify-config-contract 的权威样例源。
- `scripts/verify-config-contract.ts` — 四角静态门禁脚本，强制三判据。

## 3. 架构与约定

### 3.1 加载顺序
1. `load-env.ts` 在应用入口第一个 import 处执行 `dotenv.config()`。
2. Nest 启动时 `ConfigModule` 通过 `NestConfigModule.forRoot` 读取 `.env`（`envFilePath: '.env'`）。
3. `load: [() => defaultConfig, () => (NODE_ENV==='production'? productionConfig : developmentConfig)]` 合并两层对象。
4. 最终结果经 zod schema 校验（`validationSchema`），通过后由 `ConfigService` 对外暴露。

### 3.2 分层模型
- **default.ts**：所有环境的基线（包含 storage、stripe、oauth、eventPublish、esTruthSource、sessionReclaim、platform、oauthSso 等聚合键）。
- **development.ts / production.ts**：仅覆盖差异项（CORS origin 白名单、swagger enabled、部分 auth 行为）。
- **`.env` / `.env.example`**：运行时值来源，键名与 default.ts 中的 `process.env.XXX` 一一对应。

### 3.3 访问模式
- 业务代码通过 `ConfigService.get('key')` 或 typed getter（如 `getDatabaseConfig().url`）获取；`get` 对 undefined 抛错，实现 fail-loud。
- 配置层自身用 `process.env.XXX || 'fallback'` 直接读入对象字面量，避免在模块顶层引入循环依赖。

### 3.4 校验策略
- 使用 Zod v4 的 StandardSchemaV1 原生集成（`@nestjs/config` v12 支持），替代旧 Joi。
- `baseSchema` 集中声明每个 env 键的类型、enum、url/refine 约束及 optional/default。
- `createSchemaForEnv` 根据 NODE_ENV 选择 schema（当前开发/生产一致，保留扩展点）。
- `allowUnknown:true` + `passthrough()` 允许未声明 env 透传（与请求层 strict-by-default 相反，有意为之）。

### 3.5 安全语义
- 生产环境 CORS `ALLOWED_ORIGINS` 未配 = 空白名单 → 拒所有跨源（fail-closed）。
- SSO_OAUTH_CLIENTS 未配 = 空注册表 → authorize 一律拒（fail-closed）；配置非法则 boot 期 fail-loud。
- DATA_RESIDENCY_ENFORCE 默认按 NODE_ENV 自动 strict/warn。
- JWT_SECRET/JWT_REFRESH_SECRET 在 baseSchema 无 default → 必填，缺失即校验失败。

## 4. 约定与约束

### 已观察到的约定
- 所有环境变量统一大写蛇形命名（`DATABASE_URL`、`STORAGE_PROVIDER`、`EVENT_PUBLISH_MODE` 等），并在 `.env.example` 中集中文档化。
- 新增 env 必须同时出现在三处：`baseSchema`（config.module.ts）、`default.ts`（取值 + 默认值）、`.env.example`（带注释说明）。
- 可选配置在 zod 中使用 `.optional()` 或 `.default(...)`；必填配置不写二者。
- 枚举类配置（`STORAGE_PROVIDER`、`PAYMENT_PROVIDER`、`EVENT_PUBLISH_MODE`、`ES_TRUTH_SOURCE_SUBSCRIPTIONS`、`SESSION_RECLAIM_ENABLED`）使用 `z.enum([...])` 显式列举合法值。
- 数值型 env 统一用 `z.coerce.number()` 转换（因为 env 恒为字符串）。
- URL 类 env（`DATABASE_URL`、`ODOO_BASE_URL`）使用 `z.string().url()` 校验。
- 复杂 JSON 字符串（`SSO_OAUTH_CLIENTS`）在 envs 层通过 `parseSsoClients` 解析，而非裸 eval。
- 敏感凭据（JWT_SECRET、STORAGE_ACCESS_KEY_SECRET、STRIPE_*、*_CLIENT_SECRET、ODOO_API_KEY）只走 env，永不入库。

### 强制执行规则
1. **四角静态门禁**：`scripts/verify-config-contract.ts` 强制三个判据——
   - 判据①：`.env.example` 生效键 ⊆（zod schema 键 ∪ 代码读取键），禁止死配置。
   - 判据②：代码读取键 ⊆（`.env.example` 生效/注释态 ∪ 白名单），禁止隐藏必需项。
   - 判据③：zod 必填键（无 `.optional` 且无 `.default`）必须全部出现在 `docker-compose.yml` 的 `services.app.environment` 中。
   该脚本扫描范围钉死 `apps/**` + `libs/**` + `scripts/**`（排除 test/spec/.d.ts），并通过正则双模式匹配 `process.env.X` 与 `config.get('X')` 两种读取方式。
2. **Compose 编排契约**：`docker-compose.yml` 的 `services.app.environment` 是必填 env 的部署契约，由上述脚本第③判据保障不回潮。
3. **加载时序不可破坏**：`load-env.ts` 必须是入口第一个副作用 import，否则 ESM 静态 import 提升会导致 config/envs 求值早于 dotenv 注入（注释明确警告 Bun 会掩盖此问题）。
4. **baseSchema 缩进格式**：`baseSchema` 块内键名固定 4 空格缩进，供 verify-config-contract 的行级静态解析（注释强调「勿改缩进层级」）。
5. **feature 配置可选原则**：feature 专属 env（如 ODOO_*）在 baseSchema 中标记为 optional，不上 compose 必填闸，未注入时对应功能 503 fail-closed。
6. **生产 fail-closed 默认值**：CORS、SSO client 注册表、JWT secret 等安全相关配置在生产环境未配即拒绝服务，而非静默降级。

## 5. 补充说明

- 前端（apps/web、apps/odoo-rpc-web）使用 Vite，其环境变量通过 `import.meta.env` 单独管理，不在本配置系统范围内。
- seed 脚本（`database/seed.ts`）自带 `dotenv.config()`，独立于 API 进程，直接读取根目录 `.env`。
- 仓库根还有 `renovate.json`、`biome.json`、`commitlint.config.cjs` 等工具链配置，但不属于运行时配置系统范畴。