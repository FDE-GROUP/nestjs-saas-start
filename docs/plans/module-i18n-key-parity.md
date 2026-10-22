# i18n 键级完整性恒等闸（X3 借鉴 · module-i18n-key-parity）

> 适用范围: `模块(i18n)` + `门禁接入`（blast radius：新增 `scripts/verify-i18n-key-parity.ts` + `package.json` 脚本项 + `scripts/ci.ts` 一步）
> 关联: `research/external-borrowing-backlog.md` X3（ixartz `check:i18n` 反照）· `docs/plans/module-i18n-drop-ja`（前置：ja 已由该另案高危签核 A 摘除·本闸仅约束 zh/en）· `docs/plans/module-i18n-assets-resolution`（产物资产根闸先例）· `apps/api/src/i18n/validation-i18n.e2e.test.ts`
> 性质: **增量（expand）**——纯新增只读对拍闸，不改任何 i18n 资产内容、不改源码引用（除非对拍出真缺需补译，那属另一内容决策）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**缘起（借鉴线 X3·判据已到=独立小片）**：ixartz 持 `check:i18n`（源码引用键 ⇄ 资产文件键 双向对拍）。本仓 i18n 现有两道闸经取证**均不覆盖键级完整性**：

- `verify:i18n-assets`（[scripts/verify-i18n-assets.ts](../../scripts/verify-i18n-assets.ts)）= **编译产物**面：资产根可解析 + 3 个硬编码键 loader 取到真值 + 4 个 mjml 模板可读 + fail-closed。它证明「产物装载得起来」，**不枚举全量键**，更不比对多语言键集。
- `validation-i18n.e2e.test.ts` = **单探针键**（`validate.email.invalid`）本地化路径契约 + 响应外形。它证明「i18n 管道通」，**不覆盖键集完整性**。

**真缺口（本片刻上）**：
1. **跨语言键集恒等**：`i18n/{zh,en,ja}/*.json` 各 namespace 的键集在 3 语言间必须逐键相等——防「en 有 `validate.foo` 而 zh/ja 漏译」「某语言多出孤立键」这类漂移（当前无任何防线）。
2. **静态引用键存在于默认 locale**：源码里以字符串字面量引用的 `'(validate|emails|login)\.[\w.]+'`（取证得 22 个）必须能在默认 locale（zh）资产里命中——防「引用了不存在的键 → 运行时静默回退成 key」。

**非目标（锁死）**：
- 不做**反向死键硬闸**（资产键⇾必须被引用）——动态拼键（见 §2 边界）+ 前瞻预留键致 FP 高；至多 warn-only，归裁点 ⓐ。
- **不改栈/不接境外工具**：自研纯 Node 只读脚本（沿 `verify-*` 兄弟惯例·零第三方 dep），不引 ixartz/Crowdin/翻译平台。
- **不动资产 json 内容、不动源码引用**（除非对拍暴露真缺·那另立内容决策）。
- 不碰产物装载面（`verify:i18n-assets` 已负责·防双写）。

## 2. 方案

**引用形态取证（设计前提）**：
- 静态：zod schema `error: 'validate.x.required'`、`i18n.translate('emails.welcome.subject')` 等**字符串字面量**（22 个）。
- 动态：[mailer.service.ts L83/L92](../../apps/api/src/mailer/mailer.service.ts) 运行时构 `` `emails.${templateName}.${key}` ``——**无法静态枚举**。∴ 正向引用闸只纳**字面量引用**；动态模板键**明确 out-of-scope**（其正确性由「跨语言键集恒等」对 `emails.*` namespace 的整体结构约束兜底 + 模板名↔mjml 文件由 `verify:i18n-assets` 覆盖）。此边界须写进脚本文档头，防误读为「全量引用已闸」。

**垂直切片**：

- **切片 A · 跨语言键集恒等（核心·零 FP·高价值·非高危）**
  1. 枚举 `apps/api/src/i18n/<locale>/` 下各 locale 的 namespace 文件集（validate/emails/login/…）——断言**文件集对等**（某语言缺整个 namespace 文件即红）。
  2. 每 namespace 递归 flatten 成点分键路径集合；断言**各 locale 键集全等**（差集逐键点名：`zh-only`/`en-missing` 等）。
  3. 只读·无 diff 则 exit 0；有差 exit 1（fail-loud）。
  - **完成判据**：脚本对当前 zh/en/ja 全量跑；**先只读出「当前是否已恒等」存照**——若 ja（或任一语言）现存缺键，据实归裁点 ⓥ（补译 vs 暂缓该语言入闸），不掩盖。

- **切片 B · 静态引用键 ⇄ 默认 locale 存在（正向·带边界·非高危）**
  1. 静态扫 `apps/api/src` + `libs` 源码（排 `*.test.ts`），正则抽 `'(validate|emails|login)\.[\w.]+'` 字面量键（动态模板串不计·见上边界）。
  2. 断言每个抽得键 ∈ zh 资产 flatten 键集；不在则逐键点名 exit 1。
  - **完成判据**：当前 22 静态引用键全命中 zh；脚本头部登记动态键豁免面（mailer 两处）。

- **切片 C · 门禁接入（⚠ 改 CI 门禁·半高危·须人签核·不擅自接）**
  1. `package.json` 加 `"verify:i18n-key-parity": "node scripts/verify-i18n-key-parity.ts"`（运行时=Node·沿 `verify:i18n-assets` 同款·仅 `node:fs`/`node:path`）。
  2. `scripts/ci.ts` 加 `step('i18n key parity', run('run', 'verify:i18n-key-parity'))`（**这一步=改 CI 门禁·命中 workflow §3 高危「改门禁·CI」**）。
  - **保序**：切片 A/B 脚本先落 + 手动/`ci:quick` 外用只读跑绿存照 → **再单请高危签核**接 `ci.ts` step（承 rate-limit/type-escape 等 verify 片「脚本先落·接线随签」先例·不并档擅改门禁）。

## 3. 影响面与风险

- **blast radius**：新增 1 脚本（非高危）+ `package.json` 一行（非高危）+ `ci.ts` 一步（**半高危·改门禁**）。零 HTTP 契约变更·零 schema·零 OpenAPI 漂移。
- **可逆性**：全可逆——纯新增只读闸，revert `ci.ts` step / 删脚本即回，无状态无迁移。
- **高危命中**：仅切片 C 的 `ci.ts` 接线（workflow §3「改门禁·CI」）→ **人逐次亲签**；切片 A/B/D 脚本本体非高危。
- **风险与边界**：
  - 动态拼键使正向闸**非全量**（诚实标注·不 overclaim「引用已全闸」）。
  - 若切片 A 暴露 ja/en 现存缺键：闸会即时红 → 须先补译（内容决策·归人）或将该语言暂列基线（裁点 ⓥ），**不得为过闸而静默放宽恒等**。
  - flatten 须与 nestjs-i18n 的 namespace/分隔符语义一致（键路径口径对拍 `i18n.module.ts` 装载配置·防闸与运行时不同律=假绿/假红）。

## 4. 审计记录

> 无已审方案不写码。本案为**候选稿·待审计门**。

- 结论：**待审**（2026-10-22 Agent 依借鉴线 X3 取证起草·承用户「选 3 → X3」定向；未过审计门·不实现）。
- 归人裁点（未裁）：
  - **ⓐ 反向死键**：不硬闸（荐·FP 高）/ warn-only / 硬闸？
  - **ⓑ 动态键**：out-of-scope + 文档登记（荐）/ 另设结构约束？
  - **ⓒ 默认 locale**：zh（荐·fallback 现回落 zh 实证 `validation-i18n.e2e` L88）？
  - **ⓓ 门禁接入序**：脚本先落·`ci.ts` step 单独随高危签核（荐·承 verify 片先例）/ 一并在本案？
  - **ⓥ 多语言入闸范围**：**已裁（承用户「仅保留 zh/en」→另案 `module-i18n-drop-ja` 高危签核 A 2026-10-22 摘除 ja）**——本闸仅约束 **zh/en** 两 locale 逐键全等（闸本身从文件系统发现 locale·不硬编码语言数）；历史取证：摘除前 zh/en/ja 三语言 validate(8)/emails(24)/login(1)=33 键已逐键全等→zh/en 子集仍恒等、入闸即时不红。
- 审计人 / 日期：__

## 5. 完成判据（可核验 + 穷尽 · 过审后逐片细化）

- [ ] ⓐ–ⓥ 全部有归人裁决留痕后方可动码；
- [ ] 切片 A：跨语言键集恒等脚本对 zh/en/ja 全量只读跑·当前恒等状态成文存照（缺键者归 ⓥ 处置·不掩盖）；
- [ ] 切片 B：22 静态引用键全命中 zh·动态豁免面（mailer）登记·脚本头注诚实标注正向闸非全量；
- [ ] flatten 键路径口径与 `i18n.module.ts` 装载语义对拍一致（防闸/运行时不同律）；
- [ ] 切片 C：`ci.ts` 门禁接线**经高危亲签后**执行；未签前脚本可手动/`ci:quick` 外跑绿但不入硬链；
- [ ] `pnpm run ci` 全绿（接线后）·零 HTTP/schema/OpenAPI 变更（对拍证明）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-22 | 0.1.0 | 起草 | 承借鉴线 X3（人「选 3→X3」）首版候选稿：取证现有两闸不覆盖键级恒等·定切片 A（跨语言键集恒等）/B（静态引用⇄默认 locale 存在·动态键 out-of-scope）/C（门禁接入·改 ci.ts=半高危须签）；归人裁点 ⓐ–ⓥ 待裁 |

---

<!-- 变更戳 -->
正文已于 2026-10-22 / v0.1.0 变更，以当前正文内容为准。
