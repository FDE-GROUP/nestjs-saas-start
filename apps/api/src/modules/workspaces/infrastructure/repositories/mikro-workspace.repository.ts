import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Workspace } from '@app/modules/workspaces/infrastructure/entities/workspace.entity';
import type {
  WorkspaceDraft,
  WorkspaceRecord,
  WorkspaceRepository,
} from '@core/saas-kit/modules/workspaces/domain/repositories/workspace.repository';
import {
  createPage,
  type Page,
  type PageRequest,
} from '@core/saas-kit/shared-kernel/domain/pagination';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import { QueryOrder } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';

/**
 * ORM 修宪案 B · 切片 3c-ii-A —— workspaces 上下文的 **MikroORM 仓储适配**（`WORKSPACE_REPOSITORY` 绑定改指本类·MikroORM 为唯一实现）。
 *
 * **隔离唯一卡点不变**（global-tenancy §9.3 / FR-5）：port 不暴露 tenant 参数·所属租户从可信 ALS 经
 * `requireTenantId()` fail-closed 解析（无租户→403·且在取 em **之前**抛出→绝不查库）；读全部按
 * `organizationId` 过滤、写全部盖章，故外部租户的 workspace id 在 update/remove 恒匹配 0 行、跨租户
 * 泄漏结构上不可能。workspace 行即租户级分组本身，作用域仅按 `organizationId`（`x-workspace-id` 选择器
 * 只收窄业务数据如 posts、不收窄 workspace 目录）。本类是 workspace 隔离的**唯一卡点**·去掉任一
 * `organizationId` 谓词或改写归属即令回归红（与旧实现 版同律）。
 *
 * 读写全走 Mikro `EntityManager`（`findAndCount`/`findOne`/`create`+`persist`·`nativeDelete`）·每次
 * `fork()` 取独立 em（禁共享全局 em）。`EntityCaseNamingStrategy` 使 camelCase 属性⇄camelCase 物理列·
 * `datetime` 回真实 `Date`。`updatedAt` 无 DB 触发器（写路径显式盖时间戳·非空草稿才落 UPDATE·与旧实现
 * 「无字段变更只回读当前行」等价）。
 */
@Injectable()
export class MikroWorkspaceRepository implements WorkspaceRepository {
  constructor(
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Inject(TenantContextService) private readonly tenant: TenantContextService,
  ) {}

  /** Trusted tenant (fail-closed)·先于任何 DB 访问调用（无租户→403 且不取 em）。 */
  private scope(): { organizationId: string } {
    return { organizationId: this.tenant.requireTenantId() };
  }

  private toRecord(entity: Workspace): WorkspaceRecord {
    return {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      organizationId: entity.organizationId,
      ownerId: entity.ownerId ?? null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async list(
    request: PageRequest,
    authorizationWhere?: Record<string, unknown>,
  ): Promise<Page<WorkspaceRecord>> {
    const { organizationId } = this.scope();
    // `where` 为真实谓词对象（organizationId 必含·去之则回归测红）。**固定展开序**：授权谓词（切片 C
    // 下推的实例条件·可含 `$or`）先展、租户盖章恒为最后键——授权侧任何 `organizationId` 尝试被结构性
    // 覆盖（FR-5 唯一卡点不变）。`as never` 仅系调用边界 cast——
    // `orm.ts` 以 `entities as never` 装配致 `FilterQuery` 与 companion interface 宽化不匹配（不改运行时谓词）。
    const em = await this.mikro.fork();
    const [entities, total] = await em.findAndCount(
      Workspace,
      { ...(authorizationWhere ?? {}), organizationId } as never,
      {
        orderBy: { createdAt: QueryOrder.ASC },
        limit: request.limit,
        offset: request.offset,
      },
    );
    return createPage(
      entities.map((entity) => this.toRecord(entity)),
      total,
      request,
    );
  }

  async create(draft: WorkspaceDraft): Promise<WorkspaceRecord> {
    const { organizationId } = this.scope();
    const now = new Date();
    const em = await this.mikro.fork();
    const entity = em.create(Workspace, {
      id: uuidv7(),
      name: draft.name,
      slug: draft.slug,
      organizationId,
      // 属主值经 handler 从可信会话盖章（人裁③）；无上下文落 NULL（人裁② fail-closed 语义）。
      ownerId: draft.ownerId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await em.persist(entity).flush();
    return this.toRecord(entity);
  }

  async update(id: string, draft: Partial<WorkspaceDraft>): Promise<WorkspaceRecord | null> {
    const { organizationId } = this.scope();
    const em = await this.mikro.fork();
    // 双条件（id + 租户）寻址：外部租户的 id 恒查无→null（与旧实现 `where(and(id,org)).returning()` 同语义）。
    const entity = await em.findOne(Workspace, { id, organizationId } as never);
    if (!entity) return null;
    let dirty = false;
    if (draft.name !== undefined) {
      entity.name = draft.name;
      dirty = true;
    }
    if (draft.slug !== undefined) {
      entity.slug = draft.slug;
      dirty = true;
    }
    if (dirty) {
      entity.updatedAt = new Date();
      await em.flush();
    }
    return this.toRecord(entity);
  }

  async remove(id: string): Promise<boolean> {
    const { organizationId } = this.scope();
    const em = await this.mikro.fork();
    // 双条件（id + 租户）硬删：外部租户命中 0 行→false（谓词去之即回归红）。
    const affected = await em.nativeDelete(Workspace, { id, organizationId } as never);
    return affected > 0;
  }
}
