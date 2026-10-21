# 函数式内核件（apps/api/*/domain）相对剥离 · 识别清单与归位摸底

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）
> 关联: [functional-core.md](../functional-core.md) §7 内核地图 / §14 参考谱系 · [architecture.md](../specs/architecture.md) Entity Doctrine + 依赖表 · [global-architecture-fc-navigation.md](../plans/global-architecture-fc-navigation.md)（导航锚·FC 内容收敛）
> 日期: 2026-10-21 | 证据基线: 本仓当前 `apps/api/src/modules/*/domain/**`（find + grep 实跑取证）
> 本文只作制定 plan 的**参考**，结论须经人二次核验后方可写入方案（`workflow.md` §3）
> 受众: **Agent 可参考（非依据）· 人主导判读**

---

## 0. 用途与口径

- **背景**：承接「函数式内核能否剥离」勘察。裁定为**「相对剥离」而非「跨域剥离」**——件**留在各自上下文 `domain/` 内**、绝不抽公共 `shared-domain` 包、绝不反向 import `infrastructure/`，故**不破垂直切片硬边界（跨上下文只经领域事件）**。
- **本文件形态**：**形态①＝纯识别清单/索引**，不做任何物理搬运、不改 import、不触依赖图。目的是把「识别与管理」缺口**摸底**清楚，作为是否推进**形态②（统一子目录归位·须已审方案）**的输入。
- **FC 形态分类口径**（沿用既定四类 + 复合）：常量 / 纯函数（判定·策略） / 契约（端口·仓储端口） / VO（不变量+构造检验） / 实体（不可变+纯转移+构造检验·复合）。
- **纯净性判据**：`from '@nestjs|@mikro-orm|@fastify|@saas/contracts'` 命中=绑框架；`import type` 与 node 标准库计为纯净。本文所列件实测**全部纯净**（domain 层 17 件零框架值导入）。

---

## 1. 内核件清单（上下文 × 形态 × 现状落位）

| 上下文 | 文件（相对 `domain/`） | FC 形态 | 现状落位 |
|---|---|---|---|
| authorization | `repositories/tenant-rbac.repository.ts` | 契约·仓储端口 | `repositories/` ✅ |
| authorization | `role-assignability.port.ts` | 契约·端口 | **domain 根** ⚠️ |
| authorization | `system-role-seed.ts` | 常量·种子 | **domain 根** ⚠️ |
| authorization | `tenant-rbac-policy.ts` | 纯函数·策略 | **domain 根** ⚠️（对照 payment/storage 有 `policies/`） |
| payment | `policies/provider-selection.policy.ts` | 纯函数·策略 | `policies/` ✅ |
| payment | `ports/payment-provider.port.ts` | 契约·端口 | `ports/` ✅ |
| payment | `value-objects/money.ts` | VO（不变量+构造检验） | `value-objects/` ✅ |
| posts | `entities/post.ts` | 实体（不可变+纯转移+构造检验·复合） | `entities/` ✅ |
| posts | `repositories/post.repository.ts` | 契约·仓储端口（引 `CursorPage`） | `repositories/` ✅ |
| storage | `policies/provider-selection.policy.ts` | 纯函数·策略 | `policies/` ✅ |
| storage | `policies/upload-policy.ts` | 纯函数·策略 | `policies/` ✅ |
| storage | `ports/storage-provider.port.ts` | 契约·端口 | `ports/` ✅ |
| storage | `value-objects/storage-key.ts` | VO | `value-objects/` ✅ |
| tenants | `repositories/tenant-governance.repository.ts` | 契约·仓储端口 | `repositories/` ✅ |
| tenants | `repositories/tenant-provisioning.repository.ts` | 契约·仓储端口 | `repositories/` ✅ |
| tenants | `repositories/user-governance.repository.ts` | 契约·仓储端口 | `repositories/` ✅ |
| users | `repositories/user.repository.ts` | 契约·仓储端口 | `repositories/` ✅ |

> 注：投影镜射三件套（数据实体 + `toPostDomain` mapper + `PostEntity⇄PostState` 结构锁）**落在 `posts/infrastructure/`**（绑 `@mikro-orm`·属 Tier C·天生剥不走），不在本清单（本清单只覆盖 `domain/`）。且仅 **posts 一期**成型，其余上下文无 mapper/锁。

---

## 2. 布局一致性矩阵（各子目录法在上下文中的存在性）

| 子目录 | authorization | payment | posts | storage | tenants | users |
|---|---|---|---|---|---|---|
| `entities/` | — | — | ✅ | — | — | — |
| `value-objects/` | — | ✅ | — | ✅ | — | — |
| `policies/` | ❌（在根） | ✅ | — | ✅ | — | — |
| `ports/` | ❌（在根） | ✅ | — | ✅ | — | — |
| `repositories/` | ✅ | — | ✅ | — | ✅ | ✅ |
| `seeds/` 或 `constants/` | ❌（在根） | — | — | — | — | — |
| **domain 根散件数** | **3** | 0 | 0 | 0 | 0 | 0 |

---

## 3. 归位缺口清单（喂形态②·每条标注「统一所需触面」）

| 缺口 | 现象 | 是真缺陷还是"内容本就不同" | 统一触面 |
|---|---|---|---|
| **G1** | `authorization` 3 件（`tenant-rbac-policy.ts`/`role-assignability.port.ts`/`system-role-seed.ts`）躺 domain 根，未入 `policies//ports/` | **是**（同语义件在 payment/storage 已归子目录） | 移文件 → 改 authorization 本上下文 `application/`+`infrastructure/` 的 import 路径（半径**限于本上下文**） |
| **G2** | 端口双命名并存：`.port.ts`（出站端口）vs `.repository.ts`（仓储端口·住 `repositories/`） | **需裁定**（二者语义均为契约端口；repository 可视为 port 特化） | 若仅出**命名裁定说明**（何者用 `.port`/何者用 `.repository`）→ 可只写文档、不必改码；若强制改名 → 触 import + 宪法依赖表措辞 |
| **G3** | `policies/`/`ports/`/`value-objects/` 仅 payment+storage 齐 | **多半非缺陷**（各上下文内容本就不同·「层有内容才存在」原则） | 不强凑同形 |
| **G4** | `entities/` 仅 posts | **非缺陷**（唯一充血实体样板·一期；其余上下文实体职责已被三件套取代·见 functional-core §13 FAQ） | 保持现状 |
| **G5** | VO 落位跨包不统一：apps/api 用 `value-objects/`，libs/core 的 `Quota` 住 `quota/` | **跨包本不强求同形** | 低优先·可不动 |

---

## 4. 结论与形态②候选范围

- **真正"看得见的不一致"只有 G1 + G2**：G1＝authorization 根散件归位；G2＝`.port` vs `.repository` 命名裁定。G3/G4/G5 属"内容/边界差异"，非缺陷，不必强推同形。
- **形态②最小可行动作**（建议范围）：
  1. `authorization/domain` 三根散件归入 `policies/tenant-rbac-policy.ts`、`ports/role-assignability.port.ts`，`system-role-seed.ts` 定一个家（`constants/` 或就近）——**爆炸半径仅 authorization 一个上下文**。
  2. 出一份 **G2 命名裁定**（可能只需文档说明、零改码）。
- **风险定级**：即便只做 G1 归位，也在**确立/收敛「domain 标准子目录法」**→ 触 `docs/specs/architecture` 目录约定 → 按 AGENTS 属**高危·审计门强制·须人签核**，不得直接动手。若再加"清单恒等闸"防再漂移 → **新增 CI 门禁 = 高危签核**。
- **ROI 判定**：纯一致性/可发现性收益、**零行为变更**；做全量六上下文同形性价比低（G3/G4 本就异），**建议只做 G1（+G2 裁定）**、其余维持现状。

---

## 5. 形态②执行收口（2026-10-21 · 经人签核方案 `domain_子目录法归位`）

实际执行比 §4 建议**更进一档**（人裁「全量 canonical + 全量复核」）：

- **canonical 子目录法已入宪法**：`architecture.md`/`-zh.md` 新增「Domain sub-directory law & naming」小节 + L60 树注扩为 `entities/ value-objects/ events/ repositories/ ports/ policies/ constants/`（含 seed/词表归 `constants/`·废"驻根"惯例·点分 `<name>.<kind>.ts` 命名）。
- **G1 执行**：authorization 3 根散件归位——`policies/tenant-rbac.policy.ts`、`ports/role-assignability.port.ts`、`constants/system-role-seed.ts`（+ 共位测试随迁）。
- **G2 执行**：`.repository`（聚合持久化端口）/`.port`（其它出站端口）/`.policy`（纯策略）命名裁定已写入宪法表。
- **后缀标准化（storage）**：`policies/upload-policy.ts` → `policies/upload.policy.ts`（+ 测试），全仓 `-policy.ts`  outliers 归一到点分式。
- **未做**：清单恒等 CI 闸（§4 标注的高危项·本阶段有意不做）；libs/core 不在范围（另规则）。G3/G4/G5 维持现状。

---

## 取证方式

```bash
# 纯净性分流（domain 层 17 件全 [pure]）
for f in $(find apps/api/src/modules -path '*/domain/*' -name '*.ts' ! -name '*.test.ts'); do
  grep -qE "from '@(nestjs|mikro-orm|fastify)" "$f" && echo "[FW] $f" || echo "[pure] $f"; done
# 布局树（暴露子目录法差异）
for ctx in $(find apps/api/src/modules -maxdepth 1 -mindepth 1 -type d); do
  [ -d "$ctx/domain" ] && find "$ctx/domain" -type f -name '*.ts' ! -name '*.test.ts'; done
```

---

## 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 相对剥离形态①摸底 | 首版：apps/api/*/domain 内核件识别清单 + 布局一致性矩阵 + 归位缺口（G1–G5）+ 形态②候选范围与风险/ROI 判定 |
| 2026-10-21 | 0.2.0 | 形态②执行收口 | 新增 §5：canonical 子目录法入宪法、G1（authorization 3 件归位）、G2（命名裁定）、storage 后缀标准化；清单表保留作形态①摸底快照不改史 |
