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
 *    不伪造「最后修改」时间（沿 `tenant_role`/BA 面既有原则）；存量 NOT NULL 盖章表
 *    入 `UPDATED_AT_NULLABLE_EXEMPT` 棘轮豁免，**不迁移、只减不增**。
 *
 * **统一的层次立场**：本律统一落在「语义 + 规则治理」层；**拒绝结构继承层**
 * （BaseEntity/跨上下文共享列 spread）——跨上下文结构相似是巧合非同一概念，
 * 共享实现会把限界上下文焊死（与垂直切片方向相反）。触发器：若未来出现多态消费点
 * （泛型审计读写器之类），另立项重议，勿在本文件预支。
 *
 * ⚠ 覆盖面 = 本仓自撰表（META 系 + `Post`）；BA 契约面列形由 `mikro-auth-adapter`
 * 寻址契约钉死，本律只对其**表名恒等**登账、不裁其列形（改 BA 列=违契约）。
 */

/** 不可变表（append-only 语义：只插不改不删·无 `updatedAt` 是设计而非缺失）。 */
export const IMMUTABLE_TABLES: readonly string[] = [
  'event', // ES 事件流：版本化追加，投递状态列亦由 relay 单向推进（dispatchedAt 非「修改」语义·留痕）
  'tenant_role_grant', // 一权限格一行：变更=增删行（OR 并集语义），不原地改
  'tenant_role_audit', // 变更留痕：只插不改不删（甲裁）
];

/**
 * Better Auth 契约面八表（`database/ba/entities.ts`）：列形**不在本律覆盖面**
 * （理由=外部契约·adapter raw SQL 寻址钉死）；守卫只做表名恒等——BA 面增删表须先来此登记。
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
 * 删键；新表违 L2 直接闸红，没有加键通道（守卫断言长度上限=现值 4）。
 */
export const UPDATED_AT_NULLABLE_EXEMPT: readonly string[] = [
  'workspace',
  'user_status',
  'tenant_subscription',
  'post',
];
