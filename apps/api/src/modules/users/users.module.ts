import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { UsersController } from './api/users.controller';
import { DeleteUserCommandHandler } from './application/commands/handlers/delete-user.command-handler';
import { ExportUserDataQueryHandler } from './application/queries/handlers/export-user-data.query-handler';
import { USER_REPOSITORY } from './domain/repositories/user.repository';
import { MikroUserRepository } from './infrastructure/repositories/mikro-user.repository';

// 暴露面收紧（module-users-surface-reduction）：Create/GetUser(s) handler 随端点删除。
// 架构精度修宪 S1：聚合死管道（register/事件/no-op dispatcher/Email VO 孤儿）删除——
// users 为简单上下文（P4 合法终态：读 + PIPL 硬删 + 合规导出），domain 仅余仓储端口。
const CommandHandlers = [DeleteUserCommandHandler];
const QueryHandlers = [ExportUserDataQueryHandler];

@Module({
  imports: [CqrsModule],
  controllers: [UsersController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    // Dependency inversion: domain owns the port, infrastructure provides the adapter.
    // ORM 修宪案 B · 切片 3d（S-d1）：`USER_REPOSITORY` 绑定改指 MikroUserRepository（MikroORM 为唯一实现·
    // MikroOrmService 由 @Global MikroOrmModule 供给）。
    { provide: USER_REPOSITORY, useClass: MikroUserRepository },
  ],
  exports: [],
})
export class UsersModule {}
