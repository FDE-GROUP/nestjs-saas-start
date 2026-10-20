import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Post } from '@app/modules/posts/infrastructure/entities/post.entity';
import {
  type CursorKey,
  type CursorPage,
  type CursorPageRequest,
  createCursorPage,
  decodeCursor,
  encodeCursor,
} from '@core/saas-kit/shared-kernel/domain/pagination';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import { TenantContextService } from '@core/saas-kit/tenancy/tenant-context.service';
import { QueryOrder } from '@mikro-orm/core';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  PostDraft,
  PostRecord,
  PostRepository,
} from '../../domain/repositories/post.repository';

/**
 * ORM 修宪案 B · 切片 2 —— posts 上下文的 **MikroORM 仓储适配**（MikroORM 为唯一实现）。
 *
 * **隔离唯一 SSOT 不变**（global-tenancy §9.3 / FR-5·D2 复合作用域）：port 不暴露 tenant/workspace 参数·
 * 租户从可信 ALS 经 `requireTenantId()` fail-closed 解析（无租户→403·且在取 em **之前**抛出→绝不查库）；
 * 可选 `workspaceId` 选择器仅**收窄**读/写、非独立安全边界。故本类是 posts 隔离的**唯一卡点**·移除任一
 * `organizationId` 谓词或改写归属即令回归红（与旧实现 版同律）。
 *
 * 读写全走 Mikro `EntityManager`（`findAndCount`/`findOne`/`create`+`persist`）·每次 `fork()` 取独立 em
 * （禁共享全局 em）。`EntityCaseNamingStrategy` 使 camelCase 属性⇄camelCase 物理列（对齐 `schema.ts`·见
 * `post.entity.ts` 头注）·`datetime` 回真实 `Date`·故 `PostRecord` 的 `createdAt/updatedAt` 天然为 `Date`。
 * `updatedAt` 无 DB 触发器（旧 ORM 侧靠 app `$onUpdate`）·写路径显式盖时间戳。
 */
@Injectable()
export class MikroPostRepository implements PostRepository {
  constructor(
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Inject(TenantContextService) private readonly tenant: TenantContextService,
  ) {}

  /** Trusted tenant (fail-closed) + optional active workspace selector，resolved once·先于任何 DB 访问调用。 */
  private scope(): { organizationId: string; workspaceId?: string } {
    return { organizationId: this.tenant.requireTenantId(), workspaceId: this.tenant.workspaceId };
  }

  private toRecord(entity: Post): PostRecord {
    return {
      id: entity.id,
      title: entity.title,
      content: entity.content ?? null,
      published: entity.published,
      organizationId: entity.organizationId,
      workspaceId: entity.workspaceId ?? null,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async list(request: CursorPageRequest): Promise<CursorPage<PostRecord>> {
    const { organizationId, workspaceId } = this.scope();
    // `where` 为真实谓词对象（organizationId 必含·去之则回归测红）。`as never` 仅系调用边界 cast——
    // `mikro-orm.factory.ts` 以 `entities as never` 装配（切片 1 同源惯例）使 `em` 泛参解析为 defineEntity builder 推断
    // 类型而非 companion interface·两者在可空/默认列上 `FilterQuery` 宽化不致；cast 不改运行时谓词。
    const tenantFilter = workspaceId ? { organizationId, workspaceId } : { organizationId };

    // 首页无 cursor：仅按租户谓词取。续页：以不透明 cursor 解出 **id 单键**（#3 甲档收口·UUIDv7 时间有序），
    // 键集谓词 `id < cursorId`（与 ORDER BY id DESC 同比较语义·唯一全序→无重无漏·免受 createdAt 亚毫秒截断丢行）。
    let where: Record<string, unknown> = tenantFilter;
    if (request.cursor) {
      let key: CursorKey;
      try {
        key = decodeCursor(request.cursor);
      } catch {
        // cursor 字符集已过 DTO 闸·此处仅拦「合法 base64url 但载荷非 [id]」→ 400（先于 fork·不查库）
        throw new BadRequestException('Invalid pagination cursor');
      }
      where = { $and: [tenantFilter, { id: { $lt: key.id } }] };
    }

    const em = await this.mikro.fork();
    // 多取一条（limit+1）探下一页·免 COUNT 全量查询。排序以 `id DESC`（UUIDv7 ⇒ 时间降序·与 createdAt 序 ms 级一致）。
    const entities = await em.find(Post, where as never, {
      orderBy: { id: QueryOrder.DESC },
      limit: request.limit + 1,
    });

    const hasMore = entities.length > request.limit;
    const pageEntities = hasMore ? entities.slice(0, request.limit) : entities;
    const last = pageEntities[pageEntities.length - 1];
    const nextCursor = hasMore && last ? encodeCursor({ id: last.id }) : undefined;
    return createCursorPage(
      pageEntities.map((entity) => this.toRecord(entity)),
      hasMore,
      nextCursor,
    );
  }

  async findById(id: string): Promise<PostRecord | null> {
    const { organizationId, workspaceId } = this.scope();
    const where = workspaceId ? { id, organizationId, workspaceId } : { id, organizationId };
    const em = await this.mikro.fork();
    const entity = await em.findOne(Post, where as never);
    return entity ? this.toRecord(entity) : null;
  }

  async create(draft: PostDraft): Promise<PostRecord> {
    const { organizationId, workspaceId } = this.scope();
    const now = new Date();
    const em = await this.mikro.fork();
    const entity = em.create(Post, {
      id: uuidv7(),
      title: draft.title,
      content: draft.content ?? null,
      published: draft.published ?? false,
      organizationId,
      workspaceId: workspaceId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await em.persist(entity).flush();
    return this.toRecord(entity);
  }
}
