import type { UnitOfWork } from '@core/saas-kit/shared-kernel/domain/unit-of-work.port';
import { Inject, Injectable } from '@nestjs/common';
import { MikroOrmService } from '../mikro/mikro-orm.service';
import { TransactionScope } from './transaction-scope';

/**
 * `UNIT_OF_WORK` 端口的 MikroORM 实现（ES Phase B 后半 · module-es-outbox-transactional 切片 B·
 * 装配于 `MikroOrmModule` @Global exports，供 libs/core 治理服务与 apps handler 就地注入）。
 *
 *  - 重入：外层已有活跃事务 → 直接执行 `fn`（复用外层事务，不嵌套 BEGIN）；
 *  - 否则取**绕过 ALS** 的全新 fork（`newTransactionEm`），`em.transactional` 开事务
 *    并把事务 em 放入 ALS——此后 `fork()` 一律返回该事务 em。
 *
 * 事务边界与发布模式无关：inproc/shadow/outbox 一律可包——shadow 因此顺带获得
 * 「append 失败 → 业务写一并回滚」的更强「宁缺勿错」语义（plan §2.1 登记为语义收紧）。
 */
@Injectable()
export class MikroUnitOfWork implements UnitOfWork {
  constructor(
    // S9 教训：构造函数注入类值导入 + 显式 @Inject，防 swc design:paramtypes 退化
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
    @Inject(TransactionScope) private readonly scope: TransactionScope,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.scope.current()) {
      return fn();
    }
    const em = await this.mikro.newTransactionEm();
    return em.transactional((txEm) => this.scope.run(txEm, fn));
  }
}
