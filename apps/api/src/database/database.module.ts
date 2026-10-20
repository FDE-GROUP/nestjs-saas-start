import { DOMAIN_EVENT_PUBLISHER } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import { EVENT_STORE } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '../config/config.module';
import { DefaultDomainEventPublisher } from './eventing/domain-event-publisher';
import { MikroEventStore } from './eventing/mikro-event-store';
import { OutboxRelay } from './eventing/outbox-relay';

@Global()
@Module({
  imports: [ConfigModule, CqrsModule],
  providers: [
    // ES 首切片（module-users-es-append）：端口倒置——core 只声明 EVENT_STORE /
    // DOMAIN_EVENT_PUBLISHER 契约，适配与实现在此装配并随 @Global exports 供
    // 各上下文就地解析（沿 S10 P1 tenancy 端口先例）。
    // ORM 修宪案 B · 切片 4（contract）：EVENT_STORE 已为唯一实现 MikroEventStore（MikroOrmService 由
    // @Global MikroOrmModule 供给·懒建不劫持 DB-free 装配冒烟）；旧事件存储适配 / 旧数据库服务
    // 已随双轨收口退场。
    { provide: EVENT_STORE, useClass: MikroEventStore },
    { provide: DOMAIN_EVENT_PUBLISHER, useClass: DefaultDomainEventPublisher },
    // ES Phase B 后半（module-es-outbox-transactional 切片 C）：outbox relay——仅
    // EVENT_PUBLISH_MODE=outbox 才启 timer（缺省不触库·DB-free 不变量不动）。
    OutboxRelay,
  ],
  exports: [EVENT_STORE, DOMAIN_EVENT_PUBLISHER],
})
export class DatabaseModule {}
