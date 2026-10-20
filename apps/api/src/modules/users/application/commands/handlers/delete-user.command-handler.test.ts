import type { AuthUserStore } from '@app/modules/auth/user-store.port';
import type { EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRepository } from '../../../domain/repositories/user.repository';
import { DeleteUserCommand } from '../delete-user.command';
import { DeleteUserCommandHandler } from './delete-user.command-handler';

describe('DeleteUserCommandHandler (PIPL right-to-erase · C1 · ES 第二切片级联补删)', () => {
  const findById = vi.fn();
  const order: string[] = [];
  const hardDelete = vi.fn();
  const deleteByAggregate = vi.fn();
  const repo = { findById } as unknown as UserRepository;
  // 切片 A：硬删走 auth 域端口（台账 user→auth·users 模块纯读）。
  const userStore = { hardDelete } as unknown as AuthUserStore;
  const eventStore = { deleteByAggregate } as unknown as EventStore;
  let handler: DeleteUserCommandHandler;

  beforeEach(() => {
    findById.mockReset();
    // vitest mockReset 会抹掉初始实现：显式重建 order 追踪实现（mockClear 语义不够）
    hardDelete.mockReset();
    hardDelete.mockImplementation(async () => {
      order.push('remove');
    });
    deleteByAggregate.mockReset();
    deleteByAggregate.mockImplementation(async () => {
      order.push('purge');
      return 1;
    });
    order.length = 0;
    handler = new DeleteUserCommandHandler(repo, userStore, eventStore);
  });

  it('removes the user then purges its event rows（删除在 remove 之后·§3.2）', async () => {
    findById.mockResolvedValue({ id: 'u1' } as never);

    await expect(handler.execute(new DeleteUserCommand('u1'))).resolves.toBeUndefined();
    expect(findById).toHaveBeenCalledWith('u1');
    expect(hardDelete).toHaveBeenCalledWith('u1');
    expect(deleteByAggregate).toHaveBeenCalledWith('user', 'u1');
    expect(order).toEqual(['remove', 'purge']);
  });

  it('throws NotFound and does NOT delete/purge when user missing', async () => {
    findById.mockResolvedValue(null);
    await expect(handler.execute(new DeleteUserCommand('ghost'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(hardDelete).not.toHaveBeenCalled();
    expect(deleteByAggregate).not.toHaveBeenCalled();
  });

  it('fails loud when event purge fails（PIPL 不留残迹·错误不吞）', async () => {
    findById.mockResolvedValue({ id: 'u1' } as never);
    deleteByAggregate.mockRejectedValue(new Error('purge blew up'));
    await expect(handler.execute(new DeleteUserCommand('u1'))).rejects.toThrow('purge blew up');
  });
});
