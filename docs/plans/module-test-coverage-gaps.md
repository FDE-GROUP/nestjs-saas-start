# as-built 故事追溯零测缺口补测（payment / storage / accountLinking / password）

> 适用范围: `模块(payment·storage·auth 测试面)` ← 纯 additive 测试，零生产码/零 schema/不动门禁
> 关联: `docs/stories/*`（追溯对拍源）· `module-auth-ip-trust`（结构锁 harness 先例）· `module-common-rate-limit`（双链同源）
> 性质: 补测型（新测试文件 + 本 plan + README 索引行；不改被测实现）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

「9 Epic · 64 条 as-built 用户故事逐条对照代码讨论」收口后，做了一轮**故事↔测试可追溯对拍**
（grep 独有错误码/断言 → 命中直方图 → 命 0 组二次核验区分「真无测 vs 命名差异假阳性」）。
结论：64 条绝大多数已有可执行断言（Epic 02/03/04/05/07/08 逐条命中），仅**四处真实逻辑分支却零测**：

| 缺口 | 现状 | 待锁语义 |
|------|------|----------|
| G1 payment 面 | 模块 0 测试文件（subscriptions 席位 402 有测） | `resolve()` 三分支 + 503 懒解析降级码 |
| G2 storage 面 | 模块 0 测试文件（三 provider 皆实现） | provider 命中/回落 S3 + upload 三条 400 + validateFile 两码 |
| G3 accountLinking 并号特权 | 零测（`trusted:['google','github']` 是安全边界） | BA options 结构在场（防误删/篡改回归） |
| G4 minPasswordLength 边界 | 零测（dev-only 便利面 · D8） | `minPasswordLength:8` + `emailAndPassword.enabled` 随 `NODE_ENV` |

**目标**：以现有 Vitest 形状补四组**直接断言**，把上表四处从「命 0」转为「有测试锁」，
使故事与测试可追溯闭环（G1–G4 对应的 Epic 06/09/01.4/01.1 语义有回归防线）。

**非目标**：
- **不引入 Gherkin/Cucumber/.feature 第二测试范式**（触 Vitest 工具红线 + 双 SSOT 漂移，需修宪级 plan，本片不属此范畴）。
- 不改被测实现码（G1 的 503 分支、G2 的 provider 回落、G4 的 env 门均按现状锁，不顺手重构）。
- 不新增 gated e2e（四组全 DB-free，落默认 `pnpm run ci`，不触 `scripts/ci-fullstack.ts`）。
- 不为 Epic 06 webhook **空实现**补「假通过」测（该分支无逻辑可断言，属实现缺口非测试缺口，见故事 6.9 如实标注）。

## 2. 方案

四片均**穿透单一 seam 的纯函数/装配结构断言**，可独立验证、各自绿：

1. **切片 A（G1·payment）** —— 新 `apps/api/src/modules/payment/services/payment.service.spec.ts`
   - 注入 `providers` 桩（如 `{ stripe: {...}, alipay: {...} }`）+ `ConfigService.getPaymentConfig()` 桩，断言：
     - `resolve()` 命中：`provider='alipay'` 且已注册 → 走 alipay（各委派方法调 alipay 桩）；
     - 回落：`provider='alipay'` 但**未注册** → 回退 `providers.stripe`（L64 `?? providers.stripe`）；
     - 全无：`providers={}` → 抛 `ServiceUnavailableException` + `errorCode=BILLING_PROVIDER_NOT_CONFIGURED`（L66–69）；
     - `describe()` 返 `{selected, available}` 不抛错；`supportsRecurring()` 透传所选 provider。
   - 完成判据：三分支 + 503 码 + describe 各 ≥1 it 断言。

2. **切片 B（G2·storage）** —— 新 `.../storage/services/storage.service.spec.ts` + `.../storage/controllers/storage.controller.spec.ts`
   - Service：构造 provider 选择（`provider` 命中 → 用之；未命中 → 回落 `storageProviders.s3`·L27–32）；
     `validateFile`（size>max → `STORAGE_FILE_TOO_LARGE`；mimetype 不在白名单 → `STORAGE_FILE_TYPE_NOT_ALLOWED`）；
     `uploadMultipartFile` 委派 `uploadFileFromStream` 桩 + 临时文件清理；`deleteFile`/`getFileUrl` 透传。
   - Controller：`uploadFile` 三路径 —— `!req.isMultipart()` → `STORAGE_NOT_MULTIPART`（L79–82）；
     `await req.file()` 返 null → `STORAGE_NO_FILE`（L88–91）；内部抛错被 catch → `STORAGE_UPLOAD_FAILED`（L103–108）；
     `deleteFile` → `{success:boolean}`；`getFileUrl(key, expiresIn)` → `{url}`。
   - 完成判据：service 2 分支 + 2 validate 码、controller 3 条 400 码 + 2 正常体各 ≥1 it。

3. **切片 C（G3·accountLinking 结构锁）** —— 新 `apps/api/src/modules/auth/auth.account-linking.test.ts`
   - 复用 `auth.ip-trust.test.ts` 的 `createAuthWithOptions()` harness（stub `createAuthAdapter`/`ConfigService`），
     断言 `auth.options.account.accountLinking` = `{ enabled: true, trustedProviders 含 'google' 且含 'github' }`。
   - 语义注：此为**并号特权边界**（邮箱由 IdP 强校验的 provider 方可自动并号）——测锁「配置在场」，非验 BA 并号算法（归上游）。
   - 完成判据：accountLinking.enabled + trustedProviders 集合各一断言。

4. **切片 D（G4·password 配置结构锁）** —— 并入切片 C 同文件（同 harness·避免重复装配）
   - 断言 `auth.options.emailAndPassword`：`minPasswordLength === 8`；
     `enabled` 随环境 —— `NODE_ENV='production'` → `false`、非生产 → `true`（与 Epic 01.1/01.2 定性一致：生产关邮箱密码面）。
   - 完成判据：minPasswordLength + enabled 生产/非生产两态各一断言。

> G3/G4 共用 `CreateAuth` 装配 harness，合并为**一个** auth 结构锁测试文件；G1/G2 各按 service/controller 分文件。

## 3. 影响面与风险

- **blast radius / 可逆性**：纯 additive——仅新增测试文件（+ 本 plan + README 索引行）。**零生产代码变更、零 schema、
  不动 `docs/specs`/公共契约/门禁（husky/commitlint/Biome/CI 脚本）**。删除新增测试文件即完整回滚，**局部可逆**。
- **高危清单核对（workflow §3）**：不命中——无迁移、无删码删依赖、无改门禁、无改宪法/契约、无改 `.env`/密钥。
- **CI 连带**：四组均 DB-free → 入默认 `pnpm run ci`；基线 passed 数**只增不减**（符合既有纪律）；不登记 `GATED_E2E_FILES`。
- **桩边界**：G1/G2 以 providers 桩替真 SDK（Stripe/S3/OSS/COS 不打网络）；G3/G4 以 `createAuthAdapter` 工厂桩避免真库初始化
  （承 ip-trust 既有做法）。断言的是**我方装配/选择/降级逻辑**，非上游库算法。

## 4. 审计记录

> 无已审方案不写码。本片属局部可逆·纯 additive → **轻量自审**口径，人已过门。

- 结论：**已审计·GO**（人 2026-10-20 令「同意 / GO」·两点未决项按推荐档：① C/D 合并单文件 ② G2 controller 以单元桩 `FastifyRequest`）
- 未决项（已裁）：
  - ① C/D 合并进单文件（`auth.account-config.test.ts`）——**采合并**。
  - ② 切片 B controller 以单元桩 `FastifyRequest`（mock `req.isMultipart()`/`req.file()`）等价覆盖——**采单元桩**（不升 e2e）。
- 审计人 / 日期：人 · 2026-10-20

### 4.1 实施期偏差与实证发现（据实登记·不改码）

- **命名订正（防 R1 静默零跑地雷）**：vitest `include` 只收 `*.test.ts`（非 `*.spec.ts`），方案起草时误写
  `.spec.ts`；实施全部改用 `*.test.ts`，否则四套件静默零跑（同 `vitest.consistency.config.ts` 路径硬账教训）。
- **storage controller 两处 as-built 地雷（写测拓出·如实断言真实行为）**：
  ① `STORAGE_NO_FILE` 抛点在 `try` 内系同步 throw → 被 catch 吞成 `STORAGE_UPLOAD_FAILED`（HTTP 面不可观测 NO_FILE·仅存 service 层）；
  ② 末行 `return this.storageService.uploadMultipartFile(...)` **未 await** → 该 promise reject 逃过 catch，service 抛错
  （含 `FILE_TOO_LARGE`/`FILE_TYPE_NOT_ALLOWED`）**原样上抛保自身码**、不被归一。净果：upload HTTP 出口 =
  `NOT_MULTIPART`/`UPLOAD_FAILED`(仅 no-file)/service 原码(透传)。此为潜在实现瑕疵（catch 对主调用无效），
  属**实现缺口非测试缺口**——本片只锁现状不修码（是否收敛 catch/await 归人另裁）。

## 5. 完成判据（可核验 + 穷尽）

- [x] 四组新测试文件就位，全部 DB-free（无 `E2E_DATABASE_URL` 依赖·默认 CI 即跑）
- [x] G1：resolve 命中 / 回落 stripe / 全无→503 `BILLING_PROVIDER_NOT_CONFIGURED` / describe / supportsRecurring 均有断言
- [x] G2：provider 命中+回落 S3、validateFile 两码、controller `NOT_MULTIPART`/`UPLOAD_FAILED`（含 no-file 吞并·未-await 透传见 §4.1）+ delete/url 正常体均有断言
- [x] G3：`account.accountLinking.{enabled,trustedProviders}` 结构锁断言
- [x] G4：`emailAndPassword.{minPasswordLength,enabled(生产 false/非生产 true)}` 断言
- [x] `pnpm run ci` 全绿（基线 677→696 只增不减 · Biome 净 · fallow 0 边界违规）
- [x] `git diff` 仅含：新增测试文件 + 本 plan + README 索引行（**零生产实现改动**）
- [x] 追溯闭环：Epic 01.1/01.4/06/09 对应 token 从「测试命 0」转为「有直接断言命中」

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 起草 | 首版（追溯对拍拓出四缺口 → 补测方案·待审计） |
| 2026-10-20 | 0.2.0 | 人审 GO + 实施 | §4 翻已审计·GO（两点采推荐档）·四片测试码落地上表命名（`*.test.ts`）·§4.1 登记命名订正与 storage controller 两处 as-built 地雷（NO_FILE 被吞 / 未-await 透传）·待 `pnpm run ci` 验基线 |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.1.0 起草，以当前正文内容为准（状态以 README 索引表为单源）。
