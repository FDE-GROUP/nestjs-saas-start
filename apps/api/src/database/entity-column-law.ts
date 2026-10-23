/**
 * 实体列定律（global-entity-column-law 切片 A · 人裁 2026-10-20：②取 (a)）——
 * 公共列纪律的**清单单源**。规则语义成文于 `docs/specs/architecture.md` 附录
 * （Entity Column Law），本文件只承载清单与律条镜像注，守卫测
 * （`entity-column-law.guard.test.ts`）据此进 CI——新表违律即红，不靠评审记性。
 *
 * **设计律**：
 *  - **L1 存在性**：每张表必须有 `createdAt`；可变表必须另有 `updatedAt`；
 *    不可变表/外部契约表须显式登记在下方清单（隐式缺失即闸红）。
 *  - **L2 口径**（人裁 (a)）：新表 `updatedAt` 一律 `nullable()`——建后未改即 NULL，
 *    不伪造「最后修改」时间（沿 `organization_role`/BA 面既有原则）；存量 NOT NULL 盖章表
 *    入 `UPDATED_AT_NULLABLE_EXEMPT` 棘轮豁免，**不迁移、只减不增**。
 *
 * **统一的层次立场**：本律统一落在「语义 + 规则治理」层；**拒绝结构继承层**
 * （BaseEntity/跨上下文共享列 spread）——跨上下文结构相似是巧合非同一概念，
 * 共享实现会把限界上下文焊死（与垂直切片方向相反）。触发器：若未来出现多态消费点
 * （泛型审计读写器之类），另立项重议，勿在本文件预支。
 *
 * ⚠ 覆盖面 = 本仓自撰表（META 系 + `Post`）；BA 契约面（`BA_CONTRACT_TABLES`）**非专用·系共享表**
 * （global-governance-lifecycle-consolidation 人裁 2026-10-23）——业务/域可按需 **additive 增自撰域列**、
 * 优先数据建模范式合理性；本律对 BA 面只裁 **BA 约定列的表名恒等 + 其存在性/类型不变**（不裁 BA 自带列形细节）。
 * **红线**：不得删减/修改 BA 约定使用的字段及其数据类型（`mikro-auth-adapter` raw SQL 寻址钉死·改=违契约）。
 * 加于 BA 表的**自撰域列**（如 `organization.status`）受本律 L1/L2 约束（新增可变域列遵 updatedAt nullable）。
 */

/** 不可变表（append-only 语义：只插不改不删·无 `updatedAt` 是设计而非缺失）。 */
export const IMMUTABLE_TABLES: readonly string[] = [
  'event', // ES 事件流：版本化追加，投递状态列亦由 relay 单向推进（dispatchedAt 非「修改」语义·留痕）
  'organization_role_grant', // 一权限格一行：变更=增删行（OR 并集语义），不原地改
  'organization_role_audit', // 变更留痕：只插不改不删（甲裁）
  'audit_log', // 治理审计耐久账本：append-only（global-governance-lifecycle-consolidation 切片 E）
];

/**
 * Better Auth 契约面八表（归域两文件：auth `ba-identity.entities.ts` + tenants `ba-org.entities.ts`·
 * global-ba-entity-domain-placement）：清单语义=「BA 约定使用的表与列」——
 *  - **表非专用·可共享**：业务/域可 additive 增自撰域列（建模合理性优先·见上 ⚠ 注）；
 *  - **BA 必需列的存在性 + 数据类型受契约保护**（禁改/删/减·adapter raw SQL 寻址钉死）；
 *  - 守卫只做 BA 面**表名恒等**——BA 面增删**表**须先来此登记（加列不入本清单·由属主实体文件承载）。
 */
export const BA_CONTRACT_TABLES: readonly string[] = [
  'user',
  'account',
  'session',
  'verification',
  'organization',
  'member',
  'invitation',
  'consent',
];

/**
 * L2 棘轮豁免：现存 NOT NULL 盖章口径的可变表（insert 时 `updatedAt=createdAt`）。
 * **只减不增**（沿 type-escape ratchet 先例）：将来某表经迁移翻为 nullable 即从此清单
 * 删键；新表违 L2 直接闸红，没有加键通道（守卫断言长度上限=现值 3·global-governance-lifecycle-
 * consolidation 切片 C DROP `user_status` 旁表后其豁免键随删）。
 */
export const UPDATED_AT_NULLABLE_EXEMPT: readonly string[] = [
  'workspace',
  'organization_subscription',
  'post',
];
