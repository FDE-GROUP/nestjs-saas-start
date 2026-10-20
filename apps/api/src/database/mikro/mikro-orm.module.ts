import { UNIT_OF_WORK } from '@core/saas-kit/shared-kernel/domain/unit-of-work.port';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { MikroUnitOfWork } from '../eventing/mikro-unit-of-work';
import { TransactionScope } from '../eventing/transaction-scope';
import { MikroOrmService } from './mikro-orm.service';

/**
 * ORM 修宪案 B · 切片 2 —— app-Mikro 装配根（`@Global`）。
 *
 * 随 `AppModule` 引入即全局提供 `MikroOrmService`，供 posts 仓储就地注入（沿 `DatabaseModule` 之
 * `@Global` + `exports` 端口先例·S10 P1）。构造期不建连（见 `MikroOrmService` 懒建说明）·不劫持
 * DB-free 装配冒烟。切片 4 contract 阶段与 旧 ORM 依赖一并收口。
 *
 * ES Phase B 后半（module-es-outbox-transactional 切片 B）：同层装配 ambient 事务机制——
 * `TransactionScope`（纯 ALS 持有·零依赖）+ `UNIT_OF_WORK` 端口实现（治理服务/handler 经
 * @Global 就地解析）；构造/装配期均不触库，DB-free 不变量不动。
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    TransactionScope,
    MikroOrmService,
    { provide: UNIT_OF_WORK, useClass: MikroUnitOfWork },
  ],
  exports: [TransactionScope, MikroOrmService, UNIT_OF_WORK],
})
export class MikroOrmModule {}
