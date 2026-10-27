import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Session } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { Inject, Injectable } from '@nestjs/common';
import type { AuthSessionStore } from '../domain/ports/session-store.port';

/**
 * `AUTH_SESSION_STORE` 的 MikroORM 适配（架构精度修宪 S3）。
 *
 * 经 `MikroOrmService.fork()` 取 em——**ALS 感知**（`mikro-orm.service.ts` fork：活跃
 * UoW 事务内返回事务 em）：调用方（如 suspend-user handler）包 `uow.run` 时，本删除与
 * 域状态写**同事务**；事务外独立短操作。`session` 表属 auth 上下文（Better Auth 所有），
 * 本适配器是治理面对它的唯一受控写入口（表所有权纪律：跨上下文写须经属主端口）。
 */
@Injectable()
export class MikroSessionStoreAdapter implements AuthSessionStore {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async deleteAllForUser(userId: string): Promise<number> {
    const em = await this.mikro.fork();
    return em.nativeDelete(Session, { userId } as never);
  }

  /**
   * 写会话租级激活位（切片 4·D7）：按 `id` 主键 UPDATE 单行。`session` 属 auth 上下文（无
   * 租户隔离 filter·不走 ALS），nativeUpdate 纯 SQL 不受全局 filter 影响。同时**清 `activeOrganizationId`
   * 为 NULL**——选租与选 org 互斥不混绑，避免旧活动 org（属他租）与新 activeTenantId 轴不一致致归属面串租。
   * 下次请求中间件优先读 activeTenantId（无 org → role 缺省·需再选 org 才能进 org 级 @Can 端点）。
   */
  async setActiveTenant(sessionId: string, tenantId: string): Promise<number> {
    const em = await this.mikro.fork({ scoped: false });
    return em.nativeUpdate(
      Session,
      { id: sessionId } as never,
      { activeTenantId: tenantId, activeOrganizationId: null } as never,
    );
  }

  /**
   * 清会话租级激活位（P0 修复 X2·双激活位互斥）：按 `id` 主键 UPDATE 将 `activeTenantId` 置 NULL。
   * `session` 属 auth 上下文（无租户隔离 filter），nativeUpdate 纯 SQL 不受全局 filter 影响。调用方
   * （切活动组织门面）在 BA 写 org 成功后调本方法，使 org/租二激活位不共存。
   */
  async clearActiveTenant(sessionId: string): Promise<number> {
    const em = await this.mikro.fork({ scoped: false });
    return em.nativeUpdate(Session, { id: sessionId } as never, { activeTenantId: null } as never);
  }
}
