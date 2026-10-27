import { MIKRO_IDENTITY_ENTITIES } from '../../modules/auth/infrastructure/entities/ba-identity.entities';
import {
  MIKRO_RBAC_TABLE_ENTITIES,
  TENANT_INVITATION_META,
  TENANT_MEMBERSHIP_META,
  TENANT_ROLE_ASSIGNMENT_META,
  TENANT_ROLE_AUDIT_META,
  TENANT_ROLE_GRANT_META,
  TENANT_ROLE_META,
} from '../../modules/authorization/infrastructure/entities/rbac.entities';
import { AuditLog } from '../../modules/organizations/infrastructure/entities/audit-log.entity';
import { MIKRO_ORG_ENTITIES } from '../../modules/organizations/infrastructure/entities/ba-org.entities';
import {
  TENANT_META,
  Tenant,
} from '../../modules/organizations/infrastructure/entities/tenant.entity';
import { PostEntity } from '../../modules/posts/infrastructure/entities/post.entity';
import {
  TENANT_SUBSCRIPTION_META,
  TenantSubscription,
} from '../../modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import {
  WORKSPACE_META,
  Workspace,
} from '../../modules/workspaces/infrastructure/entities/workspace.entity';
import { EVENT_META, Event } from '../eventing/entities/event.entity';

/**
 * app-Mikro 实体集**装配根**（global-entity-context-placement 切片 B 装配根化：原聚合点
 * `database/mikro/post.entity.ts` 尾段·各实体已按 `table-ownership.ts` 表属主归位各上下文）。
 *
 * 定位：单一连接池承载的实体清单在此**集中装配**——实体定义 SSOT 各居其上下文
 * （`workspace.entity.ts`/`tenant-subscription.entity.ts`/`event.entity.ts`/
 * `rbac.entities.ts`/`post.entity.ts` + BA 七表 `entities.ts`），本文件只做聚合不做定义。
 * 演变（ORM 修宪案 B）：切片 2 仅 `Post` → 切片 3b BA 七表并入 → 切片 3c-ii 四表运行时扁平实体
 * 并入（与 BA 七表/Post **表集互斥无交叉**→无 `MikroORM.init` 注册冲突）→ RBAC 三表并入 →
 * global-governance-lifecycle-consolidation 切片 C `user_status` 旁表归位 `user.status` 真列后四表降为三表。
 * 忠实迁移实体（`migration/migration-entities.ts`）**同源**（各 META 单源·双描述消除）但仍独立
 * 装进迁移 init。懒建语义不变→`app-boot.smoke` 仍 DB-free。
 * ⚠ tsx 消费链文件一律**相对导入**（`@app` 别名 tsx 不解析）。
 */

/** META 双形运行时实体集（rehierarchy 片二 K2：旧 `OrganizationSubscription` 退役·新层根表 `Tenant`/`TenantSubscription`·均 buildRuntimeEntity 派生·并入 `MIKRO_SYS_ENTITIES`）。 */
export const MIKRO_META_TABLE_ENTITIES = [Workspace, Event, Tenant, TenantSubscription];

/** META 双形元数据（迁移装配可消费·与 `MIKRO_MIGRATION_ENTITIES` 顺序无关，恒等闸逐语句比对）。 */
export const META_TABLE_METAS = [WORKSPACE_META, EVENT_META, TENANT_META, TENANT_SUBSCRIPTION_META];

/** RBAC 表元数据（迁移装配可消费·X7 加租级成员/角色分配/邀请三表）。 */
export const RBAC_TABLE_METAS = [
  TENANT_ROLE_META,
  TENANT_ROLE_GRANT_META,
  TENANT_ROLE_AUDIT_META,
  TENANT_MEMBERSHIP_META,
  TENANT_ROLE_ASSIGNMENT_META,
  TENANT_INVITATION_META,
];

/** BA 契约面八表全集（身份机器族[auth] + 组织容器族[tenants]·global-ba-entity-domain-placement 归域后装配根聚合）。 */
export const MIKRO_ENTITIES = [...MIKRO_IDENTITY_ENTITIES, ...MIKRO_ORG_ENTITIES];

export const MIKRO_SYS_ENTITIES = [
  PostEntity,
  ...MIKRO_ENTITIES,
  ...MIKRO_META_TABLE_ENTITIES,
  ...MIKRO_RBAC_TABLE_ENTITIES,
  // global-governance-lifecycle-consolidation 切片 E：治理审计耐久账本（append-only·属主 tenants）。
  AuditLog,
];
