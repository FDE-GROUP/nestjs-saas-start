# FC 内容收敛导航锚（非破坏性·纯文档·零代码）

> 适用范围: `全局`（改 `docs/specs` 宪法 architecture = 高危·workflow §3）
> 关联: `specs/architecture.md` ±zh（Functional Core (P1) reading map 导航锚）· `docs/functional-core.md`（讲解指南·本轮不动）
> 性质: 导航型（只在宪法内加一个指针索引块，**正文不搬、既有锚点/标题不删不移、不新增任何规范句**）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

承「架构定位升格」后用户观察：领域函数式内核（P1）的内容在 `architecture.md` 里**散在 5 处**——四支柱 #3、P1 核心条、Projection-Mapping Doctrine 条、`### Functional-core inventory` 小节、`### Entity Doctrine` 小节。跨文件主链接仅 `../functional-core.md`（稳定）与 `#entity-doctrine-...`（文内已用）。目标：在 `architecture.md` ±zh「Core Design Principles」顶部建一个 **FC 单一可读入口的导航锚**（pointer index），把这 5 处串起来；不改规范、不搬正文、不动锚点。

**非目标**：不物理迁移小节（该形态「乙」经用户裁否）；不生成 distribution map、不动 `functional-core.md`/`domain-concepts.md`/`vision.md`（覆盖范围仅 architecture ±zh）；不新增 FC 规则或重述机制细节；不改代码/测试/门禁。

## 2. 设计裁定（用户 AskUserQuestion 已裁）

- **形态=甲·非破坏性导航锚**：仅新增引用块，声明 "pointers only, adds no rule / 只作指针、不新增规则"；各面 single-source 仍在原条/原节。
- **覆盖=仅 architecture.md ±zh**：中英双份同步对译。
- **锚点稳健**：索引项用粗体节名；仅对已证实的 `#entity-doctrine-domain-entity-vs-data-entity`（EN）/ `#实体教义领域实体-vs-数据实体`（ZH·按实际标题 slug 核对）与 `../functional-core.md` 使用真 href；不臆造 inventory slug。

## 3. 变更

- `architecture.md`：L13「The enforceable statements follow…」后、首条 bullet 前插「Functional Core (P1) — reading map」引用块（5 指针）。
- `architecture-zh.md`：对位「下方为可执行的细则条文…」后插「函数式领域内核（P1）— 阅读地图」中文块（物理地图项按实际节名「函数式内核件清单」书写）。

## 4. 审计记录

- 结论：非破坏性导航锚、仅 architecture ±zh、正文零搬移零改写。
- 未决项：无。
- 审计人 / 日期：用户批准（CreatePlan）/ 2026-10-21。

## 5. 完成判据（可核验 + 穷尽）

- [x] architecture.md 导航锚块就位（5 指针·声明 pointers only·无正文迁移·无规则新增）。
- [x] architecture-zh.md 对译块就位，中英语义对齐；ZH Entity Doctrine 锚点按实际标题核对。
- [x] 既有内容零改动：`git diff` 只见新增行、无删除/改写既有 FC 句与 `###` 标题。
- [ ] `pnpm run check` 绿；`pnpm run ci`（full）PASSED。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 用户观察 FC 内容散在 | 首版（非破坏性导航锚） |

---

<!-- 变更戳 -->
正文已于 2026-10-21 / v0.1.0 成文，以当前正文内容为准。
