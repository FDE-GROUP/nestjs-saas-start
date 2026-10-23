import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { describe, expect, it, vi } from 'vitest';
import { CreateWorkspaceCommand } from '../create-workspace.command';
import { CreateWorkspaceCommandHandler } from './create-workspace.command-handler';

/**
 * create 链属主盖章锁测（module-workspace-owner-column 切片 α·人裁③）：
 * handler 从可信会话（ALS userId）取属主填入 port Draft——**不经 command/body**；
 * 无 userId 上下文 → Draft.ownerId 缺省（repo 侧落 NULL·人裁② fail-closed），创建本身不 throw。
 */
function makeHandler() {
  const create = vi.fn().mockResolvedValue({ id: 'w1' });
  const tenant = new TenantIsolationService();
  const handler = new CreateWorkspaceCommandHandler({ create } as never, tenant);
  return { handler, create, tenant };
}

describe('CreateWorkspaceCommandHandler · ALS 属主盖章（切片 α）', () => {
  // command 只携 primitives（name/slug 位参）——属主不在其列，佐证人裁③「不经 command/body」。
  const command = new CreateWorkspaceCommand('Design', 'design');

  it('会话含 userId → Draft.ownerId = 可信会话值（body 伪造面为零）', async () => {
    const { handler, create, tenant } = makeHandler();

    await tenant.run({ organizationId: 'orgA', userId: 'u9', role: 'admin' }, () =>
      handler.execute(command),
    );

    expect(create).toHaveBeenCalledWith({ name: 'Design', slug: 'design', ownerId: 'u9' });
  });

  it('会话无 userId（如种子/系统路径）→ Draft.ownerId 缺省 → 列落 NULL·不 throw（人裁②）', async () => {
    const { handler, create, tenant } = makeHandler();

    await tenant.run({ organizationId: 'orgA', role: 'admin' }, () => handler.execute(command));

    expect(create).toHaveBeenCalledWith({ name: 'Design', slug: 'design', ownerId: undefined });
  });
});
