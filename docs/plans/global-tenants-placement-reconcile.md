# tenants 跨包放置文档对账（宪法 over-claim 订正）

> 用途: **已审方案 = 开发依据（人「同意」2026-10-23 签发·含高危#5 宪法措辞订正）**| 受众: 人 + Agent | 语言: 中文优先
> 定位: 纯文档·零代码·零 schema·零结构改动——只让 `docs/specs` 与代码实形对齐。

## 1. 背景与取证（架构偏差复检发现）

复检全模块层形时发现一处**未入偏移登记册的文档-代码漂移**：

- **代码实形（亲核）**：`libs/core/src/modules/tenants/` 下**只有 `lifecycle/`**（`tenant-lifecycle.ts` + status service/store·租户/用户共用状态机·P1 函数核件）——**无 `domain/`、无 `application/`**；而 `apps/api/src/modules/tenants/` 持**完整四层**（`domain/repositories/`×3 + `application/commands/handlers/` + `infrastructure/` + `api/`）。即 tenants 行为等同 users（完整 apps 本地垂直切片），仅共用纯生命周期内核上抽 core。
- **宪法误述（三处·EN/ZH 各）**：
  - 逻辑视图注（EN L62 / ZH L60）：把 `tenants` 与 `subscriptions`/`workspaces` **并列**为「`domain/`+`application/` 实际位于 libs/core」——对 tenants 不成立。
  - 两包 core 树（EN L109-110 / ZH L106-107）：`modules/{subscriptions,workspaces,tenants}` 标注「L2 发售上下文 domain+application」——tenants 误入。
  - 两包 apps 树（EN L115 / ZH L112）：「完整本地垂直切片」清单 `{users,posts,payment,storage}` **漏列 tenants**。
- **宪法自相矛盾**：§函数式内核件清单（EN L54 / ZH L48）**已正确**把 `tenants/lifecycle/tenant-lifecycle.ts` 记为 P1 内核件（散布模式·非层拆分）；§两包/§逻辑视图却把它当层拆分误并。
- **性质**：over-claim / 文档内漂移，**非结构违宪**——`verify-domain-layout` PASSED（7 上下文·27 domain 件规范）、fallow 无边界违规、依赖闸全绿。代码形态本身合理，只文档口径失真。

## 2. 方案（单切片·六处成文 EN/ZH 镜像·可选登记册补注）

将 tenants 从「域/应用居 core」组摘出、如实描述其「完整 apps 本地切片 + 共用纯内核上抽 core」混合形态：

- **EN L62 / ZH L60（逻辑视图注）**：`subscriptions`/`workspaces` 保留于 core 组；tenants 移出并注明为完整 apps 本地垂直切片、仅共用状态机内核 `libs/core/modules/tenants/lifecycle/tenant-lifecycle.ts` 作 P1 函数核件上抽（非层拆分）。
- **EN L109-110 / ZH L106-107（两包 core 树）**：`modules/{subscriptions,workspaces,tenants}` → `modules/{subscriptions,workspaces}`；单列一行 `modules/tenants/lifecycle/` 注为「非发售切片·仅共用纯状态机内核·domain/application 在 apps」。
- **EN L115 / ZH L112（两包 apps 树）**：完整本地切片清单 `{users,posts,payment,storage}` → `{tenants,users,posts,payment,storage}`，注 tenants 与 core/lifecycle 共用纯生命周期内核。
- **可选补注（偏移登记册「非偏移澄清」·EN/ZH）**：追加一句厘清 tenants **非层形偏移、属跨包放置粒度差异**（区别于 D1–D4），防再被误读。

## 3. 非目标 / 边界
- **不动任何代码/目录/依赖**（纯文档对账·结构已合法）。
- **不改 subscriptions/workspaces 的正确拆分描述**（其在 core 属实）。
- **不动 D1–D4 层形偏移行**（本案只加 tenants 非偏移澄清）。
- **不重开 tenants 是否应真拆到 core 的设计讨论**（现形态经人裁合理·本案仅如实记述）。

## 4. 签核记录（高危#5）
- 复检发现→呈报→人「同意」（2026-10-23）＝整案 GO·含宪法措辞订正（高危#5）·问责归签核人（P2）。

## 5. 完成判据
1. EN/ZH 各三处（逻辑视图注 + core 树 + apps 树）成文·tenants 不再被误列为「domain/application 居 core」拆分上下文。
2. apps 完整本地切片清单含 tenants。
3. core 树单列 tenants/lifecycle 为 P1 内核件（与 §函数式内核件清单一致·消除内部矛盾）。
4. 登记册「非偏移澄清」补 tenants 混合放置一句（EN/ZH）。
5. `pnpm run check` 绿 + pre-push 复跑 `ci` PASSED（纯文档不扰动门禁）；grep 全域无残留「tenants…domain/application 居 libs/core」误述。

## 6. 演变记录
| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-10-23 | 0.1.0 | 立方案（tenants 跨包放置文档对账·六处 EN/ZH 成文 + 登记册补注·人签核 GO·纯文档零代码） |
| 2026-10-23 | 0.2.0 | 六处 EN/ZH 成文 + 登记册「非偏移澄清」补句·check 绿·verify-domain-layout PASSED·已提交推送 `9185961`（pre-push ci PASSED）·待人类验收 |
