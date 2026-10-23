# 架构范式偏移登记册入宪 + auth 层形陈旧「过渡例外」措辞订正

> 用途: **已审方案 = 开发依据（已实施）**| 受众: 人 + Agent | 语言: 中文优先（AGENTS §6）
> 定位: 触 `docs/specs` 宪法（**高危#5**）——已由人授权 Agent 代裁签发并实施（2026-10-23）。

## 1. 背景与现状取证（事实）

人令：「这个架构范式应写入宪法的基本原则，出现偏移的地方应当明确说明，例如认证、授权部分因为引入 BA 和 CASL 导致的偏移属于开发者已确认的例外」。

勘察取证：

- **架构范式本已在宪法基本原则**：`architecture.md` `## Core Design Principles`（L5）+「Positioning — Four Pillars」（L7–11，#4 = CQRS/ES/EDA on demand but capability-ready）+ 各细则条（CA L22 / functional core L23 / projection L24 / CQRS on demand L25 / ES L29 / EDA L30）。README/vision 技术栈行只是**指针**、非第二权威。→「写入基本原则」这半**已满足**，本案**不新增范式条文**（防双 SSOT）。
- **偏移已分散记载、但无统一登记册**：§Layer-shape（EN L191–198 / ZH L182–184）记 auth/platform 两「非违规例外」；§Mechanism-vs-domain（EN L210 / ZH 对位）记 BA/CASL「库约束接口·域拥有事实」。grep 全仓**无**「deviation register / 偏移登记 / 已确认例外」集中条。
- **目录实核（非臆测）**：
  - `auth/` = `domain/ports/`(session-store/user-store) + `infrastructure/` + `api/`，**无 `application/`、无自持聚合** → 层形偏移·BA 因。
  - `authorization/` = **完整四层** `domain/{policies,ports,repositories,constants}` + `application/` + `infrastructure/` + `api/` → **形状不偏移**；其偏移属**工具裁决**（CASL 外部引擎·grant 事实在 DB·规则为运行时投影）+ 双栖性质。
  - `payment`/`storage` = 出站网关·**仍完整四层含 domain policies** → 范式变体、非偏移。
- **发现两处陈旧矛盾措辞（本案要订正）**：EN `architecture.md:260–261` 与 ZH `architecture-zh.md:233` 仍称 auth 为「**transitional exception pending its own dedicated layering plan / 过渡例外·待其专属分层专项**」——但 auth 层形归位已由 global-auth-layering-consistency（commit `88759a6`·本窗真机对拍可用）**完成**，此句现为**未更新的偏移说明**，恰属人令「偏移处应明确说明」的纠偏对象。

## 2. 方案（三切片·纯宪法文档·零代码零 schema）

### 切片 A — 新增「偏移登记册」条（核心交付·触宪法）
落点：`architecture.md` 在 `### Functional-core inventory`(L32) 前插 `### Paradigm Deviations — confirmed exceptions register`；`architecture-zh.md` 在 `### 函数式内核件清单` 前插对位中文条。**指针式表**（不复述细节·各行的权威仍在 §Layer-shape/§Mechanism-vs-domain/§Tech Stack）：

| # | 主体 | 相对标准形状的偏移 | 成因（锁定工具） | 状态·权威 |
|---|------|--------------------|------------------|-----------|
| D1 | `auth` | 无自持聚合/policies·**无 `application/` spine**；`domain/` 仅承载已发布 `AUTH_*_STORE` 端口（归位后其余按 `infrastructure/`+`api/` 分层） | **Better Auth**（永久锁定）拥有认证语义 | 永久·开发者已确认 — §Layer-shape |
| D2 | `platform` | 无 `domain/` 实体（无自有物理表） | 治理门面·数据归 tenants/users | 永久·开发者已确认 — §Layer-shape |
| D3 | `authorization` | **四层形状合规（无形状偏移）**——偏移在 RBAC *裁决* 交予**外部 CASL 引擎**：grant 事实在 DB 行·CASL 规则为运行时投影 | **CASL(`@casl/ability`)** 供能力语言·域拥有事实（库约束接口·域拥有事实） | 永久·开发者已确认 — §Mechanism-vs-domain · §Tech Stack(Authorization) |
| D4 | 战术 DDD（范式级） | 聚合优先战术 DDD **不采用**；唯一天然聚合 User 生命周期归 BA | Better Auth 拥有 user 生命周期 | 永久·§Core Design Principles（functional core 条） |

条末附「**非偏移澄清**」：payment/storage 是仍呈完整四层的出站网关·属**范式变体**非偏移；并声明「把已确认例外误读为债、或让未登记的漂移冒充例外」皆为本登记册所防。

### 切片 B — 订正 auth 层形陈旧「过渡例外」措辞（触宪法）
- EN `architecture.md:260–261`：`Only auth currently remains a thin adapter/glue plane … as a transitional exception pending its own dedicated layering plan;` → 改为「auth 系**已在案的层形例外**（系统机制面：domain/ports + infrastructure + api·无 application spine·见 §Layer-shape 与偏移登记册 D1；其分层已由 global-auth-layering-consistency 完成、非『待专项』）」，保留后半「未来某上下文出现真聚合需求经触发判据立项」句。
- ZH `architecture-zh.md:233` 对位镜像同改。

### 切片 C — README 指针（低风险·非宪法）
README「架构范式」行末补一句「已知偏移（auth/BA、authorization/CASL 等）见 architecture §Paradigm Deviations 登记册」，使消费者面可见偏移口径。**不复述**表格内容（防双 SSOT）。

## 3. 非目标 / 边界
- **不新增/不改写范式基本原则**（四支柱已在案·本案只加偏移登记册 + 订正陈旧句）。
- **不动代码/目录/门禁**（纯文档·零 `.ts`·零 schema）。
- **不新立授权偏移的机制**（D3 只如实说明 CASL 现状·authorization 本就合规四层）。
- 各行**指针化**指向既有权威段，登记册本身不承载细节 SSOT。

## 4. 签核记录（高危#5）
- 本 plan = 呈请签发物；切片 A/B 触 `docs/specs` 宪法，先呈精确措辞。
- 签核：人「认同分析结果、**授权自行裁定**」（2026-10-23）= 整案 GO（A+B+C）+ D3 采「形状合规·偏移在工具裁决」诚实定性（Agent 代裁）。问责归授权签核人（P2）。
- 实施状态：切片 A（EN/ZH 登记册）· B（EN:260/ZH:233 陈旧句订正）· C（README 指针）均已落笔。

## 5. 完成判据（签发后）
1. architecture.md ±zh 各新增 `### Paradigm Deviations` 条·D1–D4 齐·EN/ZH 镜像·指针式无双 SSOT。
2. EN:260–261 / ZH:233「transitional/过渡例外·待专属分层专项」措辞清零，改指 §Layer-shape + D1。
3. README 指针句就位（不复述）。
4. `pnpm run check` 绿 + pre-push 复跑 `ci` PASSED（纯文档不应扰动门禁）。
5. 单源核对：登记册各行的权威段（§Layer-shape/§Mechanism-vs-domain/§Tech Stack）与本册口径一致、无矛盾。

## 6. 演变记录
| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-10-23 | 0.1.0 | 立方案呈签核（偏移登记册入宪 + auth 层形陈旧「过渡例外」订正 + README 指针·触高危#5 待 GO） |
| 2026-10-23 | 0.2.0 | 人授权 Agent 代裁整案 GO·D3 采诚实定性；切片 A/B/C 已实施（architecture.md ±zh 新增范式偏移登记册 + 订正 auth 陈旧「待专项」措辞 + README 指针句） |
