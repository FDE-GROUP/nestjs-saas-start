# i18n 摘除日语 locale · 仅保留 zh/en（module-i18n-drop-ja）

> 适用范围: `模块(i18n)` + `改宪法`（blast radius：`docs/specs/tooling-standards.md` 一处 + `ja/` 资产 3 文件 + `assets-root.ts`/其测/`mailer.service.test.ts` 引用面）
> 关联: `research/external-borrowing-backlog.md` X3（承 `module-i18n-key-parity` ⓥ 前置）· 被 supersede 的 `specs/tooling-standards.md` L62「保留 en/ja」· `plans/global-cn-adaptation.md` L35/L155/L254「不删 en/ja」
> 性质: 收缩型（删内容 + 改宪法措辞）·**高危·已人签核**
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

用户 2026-10-22 定向「仅保留 zh/en」→ 归人裁 **A：签核摘除 ja**（权威层级=用户当前指令·最高）。

**冲突与定性（取证坐实）**：ja 受两处**已审承诺**保护——宪法 `tooling-standards.md` L62「保留 en/ja」+ `global-cn-adaptation.md` L155「不删 en/ja」（及 L35/L254）。∴ 本变更命中 AGENTS §2 高危「改 `docs/specs` 宪法」+ workflow §3「删码删内容」→ **须人亲签**（已签 A）。

**非目标**：不改 zh/en 任何资产与装配；不动 `i18n.module.ts`（无 ja 硬编码·靠文件系统发现 locale·删目录即不注册）；不重写 `global-cn-adaptation` 历史落地说明（**不改史**·由本案显式 supersede）。

## 2. 方案（单片·人签 A 后一次落地）

1. **改宪法（高危本体·已签）**：`tooling-standards.md` L62「（保留 en/ja）」→「（保留 en；`ja` 日语 2026-10-22 人签核 A 摘除·见本案）」，落地状态补注摘除。
2. **删资产**：`apps/api/src/i18n/ja/{validate,emails,login}.json`（3 文件·`git rm`）。
3. **改代码引用**：
   - `assets-root.ts`：`PROBE_LANGS = ['zh','en','ja']` → `['zh','en']`；头注 + fail-closed 报错文案「zh/en/ja」→「zh/en」。
   - `assets-root.test.ts`：真值断言循环 `['zh','en','ja']` → `['zh','en']`（注释「三语言」→「两语言」）。
   - `mailer.service.test.ts`：`sendForgotPasswordEmail` 用例的透传样本 lang `'ja'` → `'en'`（该用例 i18n 为 mock·仅验 lang 透传 + subject 装配·非依赖真 ja 资产；换现存 locale 免误导）。

## 3. 影响面与风险

- **高危命中**：改 `docs/specs` 宪法（AGENTS §2）+ 删内容（workflow §3）→ **人签核 A（2026-10-22）**。
- **blast radius 完备性取证**：全仓 `ja`/`ja-JP` 命中仅上述位（`apps/web`·`nest-cli.json`（glob `i18n/**`·删目录即不拷）·`.env*`·compose·`verify:i18n-assets`（只 zh/en）·`validation-i18n.e2e`（只 zh/en）均无 ja）→ 无遗漏触面。
- **可逆性**：资产可 `git revert` 复原；宪法措辞回改即可·无迁移无状态。
- **风险**：若有运行期按 `ja-JP` 请求 locale 的真实用户，摘除后经 `AcceptLanguageResolver` 回落 zh（fallback=zh·既有语义·不抛错）。产品面向中国大陆·中文优先·英语辅·日语未对外承诺·接受。

## 4. 审计记录

- 结论：**已审·人签核 A**（2026-10-22·用户在 X3 语境下就枚举 blast radius 明示「A」=签核摘除 ja·含改宪法 L62）。
- 归人裁点：无开放项（方向已由 A 定；ⓐ–ⓤ 属 `module-i18n-key-parity` 本案不涉）。
- 审计人 / 日期：用户（A）/ 2026-10-22。

## 5. 完成判据

- [x] `tooling-standards.md` L62 宪法措辞改定（zh/en·注 ja 摘除来源）；
- [x] `ja/` 三资产删除·`nest-cli` glob 不再拷 ja（产物 `dist/i18n/` 仅 `{emails,en,zh}`）；
- [x] `assets-root.ts` `PROBE_LANGS` + 注释/报错文案、`assets-root.test.ts` 循环、`mailer.service.test.ts` 样本 lang 全部收至 zh/en；
- [x] 全仓复 grep 源码 `ja`/`ja-JP` 归零（仅历史 plan + 本案 supersede 记录存字）；
- [x] build TSC 0·`verify:i18n-assets` 三面绿·定向 test 13/13·`pnpm run ci` PASSED（885 passed | 52 skipped (937)·fallow 无边界违规·基线不回归）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-22 | 0.1.0 | 起草 + 已审（人签 A） | 承用户「仅保留 zh/en」→裁 A；取证 blast radius（宪法 L62 + 3 资产 + 3 引用面·无遗漏）；定性高危（改宪法+删内容）·已签；立本案 supersede tooling/cn-adaptation 保留 ja 立场 |
| 2026-10-22 | 0.1.1 | 实现落地 | 宪法 L62 改定 + `ja/` 三资产删 + 4 引用面（assets-root.ts/.test.ts、mailer.service.test.ts）收至 zh/en；复 grep 源码 ja 归零；build TSC 0·产物 `dist/i18n` 仅 `{emails,en,zh}`；`verify:i18n-assets` 三面绿；定向 test 13/13；`pnpm run ci` PASSED 885/52skip(937)·fallow 无边界违规 |

---

<!-- 变更戳 -->
正文已于 2026-10-22 / v0.1.1 变更，以当前正文内容为准。
