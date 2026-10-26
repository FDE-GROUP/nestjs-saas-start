import { ConfigService } from '@app/config/config.service';
import type { EntityManager, MikroORM } from '@mikro-orm/core';
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { mikroAuthAdapter } from '@okee/ba-mikro-adapter/mikro-auth-adapter';
import { TransactionScope } from '../eventing/transaction-scope';
import { initMikroOrm } from './mikro-orm.factory';
import { MIKRO_SYS_ENTITIES } from './sys-entities';
import { applyTenantFilterParams, tenantFilterArgsFromScope } from './tenant-isolation-filter';

/**
 * ORM 修宪案 B · 切片 2 —— app 侧 MikroORM v7 连接持有者（**懒建**）。
 *
 * 刻意不在构造期 / `onModuleInit` 建连：`MikroORM.init()` 会开连接，若 eager 则劫持 `app-boot.smoke`
 * （DB-free 整树装配冒烟）与 `verify:prod-boot`（只打 /health·不碰 posts）。故首次**真正用到** posts
 * 数据面时才 `ensure()` 懒 init（本仓默认 CI 不跑真 posts 读写→永不触发·保持 DB-free 不变量）；
 * env-gated 全栈 e2e 打 `/posts` 时才真连。`onModuleDestroy` 仅在曾建过连时 close。
 *
 * 实体集＝`MIKRO_SYS_ENTITIES`（切片 2 仅 `Post`·切片 3b 已并入 BA 七表为单一 app-orm）。
 * 每次读写经 `fork()` 取**独立 em**（禁共享全局 `orm.em`·V4 串租户教训·与切片 1 adapter 同纪律）。
 */
@Injectable()
export class MikroOrmService implements OnModuleDestroy {
  private readonly logger = new Logger(MikroOrmService.name);
  private orm?: MikroORM;
  private pending?: Promise<MikroORM>;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    // ES Phase B 后半（module-es-outbox-transactional 切片 B）：ambient 事务参与——
    // TransactionScope 零应用内依赖，无循环导入；缺装时（单测直 new）降级为无事务行为。
    @Inject(TransactionScope) private readonly txScope: TransactionScope,
  ) {}

  private async ensure(): Promise<MikroORM> {
    if (!this.pending) {
      const url = this.config.getDatabaseConfig().url;
      this.pending = initMikroOrm(url, MIKRO_SYS_ENTITIES).then((orm) => {
        this.orm = orm;
        this.logger.log('MikroORM app-orm connected (posts + BA adapter)');
        return orm;
      });
    }
    return this.pending;
  }

  /**
   * per-operation fork（读写各取独立 em·绝不共享全局 `orm.em`）。
   * ES Phase B 后半：活跃 UoW 事务内返回**事务 em**（域行/事件行同生共死）；事务外维持原样。
   *
   * 第三次复裁切片 1（行级隔离机制化）：默认 `scoped` 时从 ALS 派生租户/组织上下文注入全局 filter
   * 参数（`tenant-isolation-filter`）——无 tenantId 上下文（跨租治理/seed/saga/迁移）自然不筛；
   * `scoped:false` 显式绕过（传空参·供有上下文仍须跨租面）。
   */
  async fork(options?: { scoped?: boolean }): Promise<EntityManager> {
    const scoped = options?.scoped !== false;
    const args = scoped ? tenantFilterArgsFromScope() : {};
    const txEm = this.txScope?.current();
    if (txEm) {
      applyTenantFilterParams(txEm, args);
      return txEm;
    }
    const orm = await this.ensure();
    const em = orm.em.fork();
    applyTenantFilterParams(em, args);
    return em;
  }

  /** `MikroUnitOfWork` 开事务专用：**绕过 ALS** 永远取全新 fork（防嵌套/防复用外层事务 em 重复 BEGIN）。跨租 UoW·不装配租户 filter。 */
  async newTransactionEm(): Promise<EntityManager> {
    const orm = await this.ensure();
    return orm.em.fork();
  }

  /**
   * 切片 3b：为 Better Auth 数据面产出**自持 Mikro adapter 工厂**（`mikroAuthAdapter(orm)`）。
   * 内部 `await ensure()` 复用同一条懒建连接·**不外泄 `orm`/`em` 实例**（只交出适配器·戒全局 em）。
   * 切片 4（contract）：旧 ORM 双轨已收口——`CreateAuth` **无条件**调本方法取 BA 唯一数据面出口，
   * 但仍 `await ensure()` 懒建→保持 DB-free 装配冒烟不变量（`app-boot.smoke` 只 `compile()` 不触发）。
   */
  async createAuthAdapter(): Promise<ReturnType<typeof mikroAuthAdapter>> {
    const orm = await this.ensure();
    return mikroAuthAdapter(orm);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.orm) {
      await this.orm.close();
      this.logger.log('MikroORM app-orm disconnected');
    }
  }
}
