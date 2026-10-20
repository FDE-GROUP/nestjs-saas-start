import { AsyncLocalStorage } from 'node:async_hooks';
import type { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';

/**
 * 活跃事务 em 的 AsyncLocalStorage 持有器（ES Phase B 后半 · module-es-outbox-transactional 切片 B）。
 *
 * 「ambient UoW」机制的运行时底座：`MikroUnitOfWork.run` 把事务 em 放入 ALS，
 * `MikroOrmService.fork()` 在活跃事务中直接返回该 em——于是发布点关键段内的**全部**仓储写
 * 与事件 append 复用一个事务，无需改任何端口签名（域行与事件行同生共死）。
 *
 * 本类**零应用内依赖**（只持 ALS + em 类型），供 `MikroOrmService` 与 `MikroUnitOfWork`
 * 双向消费而无循环导入；原生 ALS（不引第三方 cls 库，沿最少依赖偏好）。
 */
@Injectable()
export class TransactionScope {
  private readonly als = new AsyncLocalStorage<EntityManager>();

  /** 当前活跃事务 em；不在 `MikroUnitOfWork.run` 内 → undefined。 */
  current(): EntityManager | undefined {
    return this.als.getStore();
  }

  run<T>(em: EntityManager, fn: () => Promise<T>): Promise<T> {
    return this.als.run(em, fn);
  }
}
