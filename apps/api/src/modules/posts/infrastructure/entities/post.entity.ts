import { defineEntity, p } from '@mikro-orm/core';

/**
 * posts 上下文的 **零装饰器** MikroORM v7 **物理数据实体**（module-posts-domain-entity-split：与
 * `domain/entities/post.ts` 的**充血领域实体** `Post` 严格分离·二者由仓储适配器双向映射·
 * 见 architecture「Entity Doctrine」）。
 *
 * 命名去冲突：领域实体占纯名 `Post`，本数据实体 TS 标识符作 `PostEntity`；但 `defineEntity` 的
 * 元数据 `name:'Post'` 与 `tableName:'post'` **保持不变**（迁移面 `migration-entities.ts` 独立、列定律按表名寻址、
 * seed/装配按类引用——只改 TS 标识符，不动元数据/物理名）。
 *
 * global-entity-context-placement 切片 B 归位：原 `database/mikro/post.entity.ts`·判据=`table-ownership.ts` 表属主
 * `post→posts`；ORM 修宪案 B · 切片 2 出身）。
 *
 * 放置口径：「物理表 → 实体」的映射属基础设施层，本文件居 `modules/posts/infrastructure/entities/`
 * （仓储从此引 `PostEntity`）。聚合装配（`MIKRO_SYS_ENTITIES`）已移居 `database/mikro/sys-entities.ts` 装配根。
 *
 * 列名走 `EntityCaseNamingStrategy`（见 `database/mikro/mikro-orm.factory.ts`）：属性名**原样**作列名（camelCase 列·SQL 双引号限定），与
 * `database/schema.ts` 里 `post` 表的物理列（`id/title/content/published/organizationId/workspaceId/createdAt/updatedAt`
 * 均 camelCase）**逐列对齐**，故两侧读写键名一致、无需 snake↔camel 往返。
 *
 * 跨模型外键（`organizationId`→organization、`workspaceId`→workspace）当**普通 string 列**存（不建 Mikro 关系
 * 对象）——与 BA 表面实体同构；DB 侧 FK 约束（cascade / set null）仍由物理表强制，本实体不参与关系装配。
 * `updatedAt` 在旧实现靠 app 级 `$onUpdate` 维护（无 DB 触发器），故写路径（仓储）显式盖时间戳。
 */
/**
 * 实例类型（companion interface·与下方 `const PostEntity` 声明合并）：MikroORM v7 unchained 下 `defineEntity` 只产
 * 运行时实体描述·TS 实例形状须由同名 `interface` 提供（v7 文档标准写法）——供仓储侧 `FilterQuery<PostEntity>` /
 * `entity: PostEntity` 寻址。字段与物理列一一对应·`datetime`⇄`Date`·`nullable`⇄`| null`。
 */
export interface PostEntity {
  id: string;
  title: string;
  // nullable 列：Mikro 推断实体实例为 `T | null | undefined`（未刷新时可缺）·故取可选以对齐 `em` 返回值；
  // 仓储 `toDomain` 统一 `?? null` 归一为领域实体的复原入参。
  content?: string | null;
  published: boolean;
  // 归属租户（global-tenant-organization-rehierarchy 切片 B·expand 段 nullable·切片 C 换轴后读谓词锚本列。
  // 片二 K3 复裁：维持 nullable——本列系适配器写侧盖章（不入域 `PostState`·见 `post-mapping.ts` 投影同构锁），
  // 升 NOT NULL 会迫使写侧列入域镜射，与投影镜射教义相左；隔离由 `requireActiveTenantId` 谓词 + gated e2e 卡控。
  tenantId?: string | null;
  organizationId: string;
  workspaceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const PostEntity = defineEntity({
  name: 'Post',
  tableName: 'post',
  properties: {
    id: p.string().primary(),
    title: p.string(),
    content: p.string().nullable(),
    published: p.boolean().default(false),
    tenantId: p.string().nullable(),
    organizationId: p.string(),
    workspaceId: p.string().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
  },
});
