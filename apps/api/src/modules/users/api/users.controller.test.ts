import { call } from '@orpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersController } from './users.controller';

// 暴露面收紧（module-users-surface-reduction·人裁甲）：create/findAll/findOne 路由与其
// 测试随端点删除；本测只覆盖保留的用户自助面（PIPL 导出/删除）。
// 换轨 WP-C：两路由转 per-method `@Impl`（方法返回 procedure·主体经 context.user）·
// 本测经 `call(procedure, undefined, { context })` 驱动 handler（无入参·input undefined）。
describe('UsersController (bus-backed, self-service surface only)', () => {
  const executeCommand = vi.fn();
  const executeQuery = vi.fn();
  const commandBus = { execute: executeCommand } as never;
  const queryBus = { execute: executeQuery } as never;

  let controller: UsersController;
  const sessionUser = { id: 'u9', email: 'a@b.c' };

  beforeEach(() => {
    executeCommand.mockReset();
    executeQuery.mockReset();
    controller = new UsersController(commandBus, queryBus);
  });

  it('GET /users/me/data-export dispatches ExportUserDataQuery with session user id', async () => {
    const payload = { user: { id: 'u9' }, accounts: [], sessions: [], consents: [] } as never;
    executeQuery.mockResolvedValue(payload);

    await expect(
      call(controller.exportMe(), undefined, { context: { user: sessionUser } }),
    ).resolves.toBe(payload);
    const q = executeQuery.mock.calls[0][0];
    expect(q).toMatchObject({ userId: 'u9' });
  });

  it('DELETE /users/me dispatches DeleteUserCommand with session user id', async () => {
    executeCommand.mockResolvedValue(undefined);

    await expect(
      call(controller.deleteMe(), undefined, { context: { user: sessionUser } }),
    ).resolves.toBeUndefined();
    const cmd = executeCommand.mock.calls[0][0];
    expect(cmd).toMatchObject({ userId: 'u9' });
  });
});
