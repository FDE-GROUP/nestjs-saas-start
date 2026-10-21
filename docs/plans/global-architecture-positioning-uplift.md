# 架构定位升格与缺口处置（纯文档·零代码）

> 适用范围: `全局`（改 `docs/specs` 宪法 architecture/vision = 高危·workflow §3）
> 关联: `specs/architecture.md` ±zh（Positioning — Four Pillars · Entity Doctrine · Layer-shape）· `specs/vision.md` §6 · `docs/functional-core.md` §9 · `docs/domain-concepts.md` §8 · [global-review-followups-reconcile.md](./global-review-followups-reconcile.md)（④⑤ 登记另档）
> 性质: 固化型（把既已成文教义与既有强制机制凝练为定位总纲，**不新增规则、不改任何生产码/测试/门禁**）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

架构定位评估报告（人提交 2026-10-21）给出唯一实质动作：把四点定位——**CA 为底 · DDD 量力 · FC 三映射为突破 · CQRS/ES/EDA 按需但备能**——从 `architecture.md` 中分散的设计原则条升格为凝练的宪法定位总纲；并处置报告所列 5 缺口。`architecture.md` 四柱分散在位（L7 CA / L8 FC / L9 Projection-Mapping / L10 CQRS / L14 ES / L15 EDA）但无身份摘要段；`vision.md` §6 传承止于 2026-10-20 精度修宪、未纳入 2026-10-21 FC 投影镜射教义。

目标：定位总纲 canonical 只落 architecture（EN+ZH 双语镜像），`vision.md` §6 加**一句回指指针**（防双 SSOT）；把「每句定位须映射既有强制机制、杜绝 over-claim」写实。

**非目标**：不改生产代码/测试/门禁；不推广其余上下文 FC 化（各自已审切片）；不做幻影清理（`AggregateRoot`/`schema.ts` 另案）；不实现 ④⑤ 修复本体。

## 2. 变更清单（本档落地）

- **① 定位总纲（触宪法）** —— `architecture.md`「## Core Design Principles」标题下、首条 bullet 前加「Positioning — Four Pillars」段（EN）；`architecture-zh.md` 对位加「定位——四支柱」段（ZH）。四句各附机制指针（core 纯度守卫 / 表所有权守卫 / fallow 0 / OpenAPI 三向漂移 / 列律恒等 / 三映射三件套 / 能力基线），段末 `See detailed bullets below`，不复述细节。
- **② vision §6 指针（防双 SSOT）** —— `vision.md` §6 架构条：「函数式领域内核」补注「含 2026-10-21 投影镜射/实体教义一期」；尾部加四点定位已升为宪法定位、canonical 见 architecture「Positioning — Four Pillars」一句。不重述四句。
- **③ 层形豁免判据（触宪法·缺口②）** —— `architecture.md`（+zh）Entity Doctrine 之后新增「Layer-shape: a layer exists only if it has content — the auth / platform case」段：把 `auth`（BA 契约面·台账写面属主但无本地 `domain/`）与 `platform`（治理门面·无自有表）对四目录强制的关系固化为「层有内容才存在」的具体化——无自有不变量/无自有表时该层合法缺省，一经出现即须归位；只放行省略*空*层，不跳过分层纪律。
- **④ 指南补齐实体教义/三映射（docs 指南·缺口①）** —— `functional-core.md`：§8 后新增「## 9. 实体教义与三映射（投影镜射·一期已进）」，把旧「实体三职责拆走→record」叙事衔接至 2026-10-21 教义；订正 §8「数据形状→不可变 record」措辞加「教义一期已把'数据形状'进一步分为领域态契约与数据实体两层」；原 §9–12 顺延为 §10–13（含内部指针同步）。`domain-concepts.md`：§8 表↔实体后加「投影镜射（domain entity ↔ data entity ↔ table）」节，一句话定义 + 指 architecture Entity Doctrine/Projection-Mapping，只述不裁。
- **⑤ 投影教义 roadmap 覆盖确认（缺口③）** —— 不新增：`architecture.md` Projection-Mapping 条尾句「other persistence contexts are pending via their own audited plans」已含序约，本方案仅在定位总纲与 §9 回指此条。

## 3. 影响面与风险

- **高危触宪法**：改 `docs/specs`（architecture/vision）须人签核——本方案经 CreatePlan 批准即签核；措辞只固化既已成文教义与既有机制，不新增规则。
- **防双 SSOT**：定位 canonical 仅在 architecture（中英双份），vision 只指针。
- **中英对齐**：architecture-zh 为对译镜像，段/节须语义一致（本窗以 python 复核防 CJK 形近字污染）。
- **可逆性**：纯文档，逐段删除即回滚。

## 4. 审计记录

- 结论：四点定位升格为 architecture 宪法定位总纲（中英）；vision 单句回指；层形豁免判据成文；两份指南补齐投影镜射；缺口③仅回指不新增；④⑤ 登记另见 followups-reconcile 档、只呈报不实现。
- 落实边界：用户 AskUserQuestion 裁定=全含（含 ④⑤ 登记）。
- 未决项：无。
- 审计人 / 日期：用户批准（CreatePlan）/ 2026-10-21。

## 5. 完成判据（可核验 + 穷尽）

- [x] architecture.md / architecture-zh.md「Positioning — Four Pillars / 定位——四支柱」成文，四句各带机制指针、无 over-claim、中英对齐。
- [x] vision §6 一句指针就位（不回述全文·防双 SSOT）。
- [x] functional-core.md 新增 §9 + §8 措辞订正 + §9–12 顺延为 §10–13；domain-concepts.md 新增投影镜射节。
- [x] architecture（+zh）auth/platform 层形豁免判据段成文。
- [x] 缺口③确认回指、无新增。
- [ ] `pnpm run check`（Biome·md 不在 format 面）绿；`pnpm run ci`（full）PASSED。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 架构定位评估报告落实 | 首版（定位升格 + 层形豁免 + 指南补齐投影镜射） |

---

<!-- 变更戳 -->
正文已于 2026-10-21 / v0.1.0 成文，以当前正文内容为准。
