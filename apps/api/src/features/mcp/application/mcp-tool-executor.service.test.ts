import { ListTenantDirectoryQuery } from '@app/modules/organizations/application/queries/list-tenant-directory.query';
import { ListPostsQuery } from '@app/modules/posts/application/queries/list-posts.query';
import type { PermissionChecker } from '@core/saas-kit/authorization/permission.port';
import { CreateWorkspaceCommand } from '@core/saas-kit/modules/workspaces/application/commands/create-workspace.command';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { HttpException } from '@nestjs/common';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedMcpCredential } from '../../../modules/auth/application/ports/mcp-token-verifier.port';
import { McpToolExecutorService } from './mcp-tool-executor.service';

/**
 * MCP 工具执行壳单测（切片 2/3·纯 mock 总线零 DB·立「零第二套判据」卡尺）。
 *
 * 卡尺：①派发既有查询/命令类且入参只取自**凭证盖章行**（调用侧 args 零身份可注入）；
 * ②posts.list 先过活动租户 fail-closed 卡点再查（ALS 未绑绝不裸查）；③页宽缺省/值域收敛/cursor 透传；
 * ④（切片 3）workspace.create 写支：租属校验单点（跨租/不存在同回执防枚举·派 command 前先拦）、
 * 权限对称接 checker（deny→403 且不派 command）、缺参 400、命令派发时 ALS 补 organizationId 二级轴。
 * 真 ALS+总线+仓储双盖章链路由 gated e2e 承担。
 */
describe('McpToolExecutorService', () => {
  let queryBus: { execute: ReturnType<typeof vi.fn> };
  let commandBus: { execute: ReturnType<typeof vi.fn> };
  let tenant: {
    requireActiveTenantId: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
    role: string | undefined;
  };
  let checker: { can: ReturnType<typeof vi.fn> };
  let executor: McpToolExecutorService;

  const cred: VerifiedMcpCredential = {
    credentialId: 'c1',
    tenantId: 'T1',
    userId: 'U1',
    name: 'cli',
    scopes: ['read'],
  };
  const writeCred: VerifiedMcpCredential = { ...cred, scopes: ['read', 'write'] };

  /** 该用户在 T1 下可见一组织 O1（目录条目·租属校验单源）。 */
  const directory = [
    {
      tenantId: 'T1',
      name: 'Acme',
      organizations: [{ organizationId: 'O1', name: 'Org1', slug: 'o1' }],
    },
  ];

  beforeEach(() => {
    queryBus = { execute: vi.fn() };
    commandBus = { execute: vi.fn() };
    tenant = {
      requireActiveTenantId: vi.fn().mockReturnValue('T1'),
      get: vi.fn().mockReturnValue({ tenantId: 'T1', userId: 'U1', role: 'owner' }),
      // 直接在该 ctx 下执行回调（不引真 ALS·卡尺只验补轴入参形）。
      run: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
      role: 'owner',
    };
    checker = { can: vi.fn().mockResolvedValue(true) };
    executor = new McpToolExecutorService(
      queryBus as unknown as QueryBus,
      commandBus as unknown as CommandBus,
      tenant as unknown as TenantIsolationService,
      checker as unknown as PermissionChecker,
    );
  });

  it('tenant.directory：以凭证盖章 userId 派发目录查询，回执为条目 JSON', async () => {
    const entries = [{ tenantId: 'T1', name: 'Acme', organizations: [] }];
    queryBus.execute.mockResolvedValue(entries);
    const res = await executor.execute('tenant.directory', cred, {});
    expect(queryBus.execute).toHaveBeenCalledTimes(1);
    const query = queryBus.execute.mock.calls[0]?.[0];
    expect(query).toBeInstanceOf(ListTenantDirectoryQuery);
    expect(query.userId).toBe('U1');
    expect(JSON.parse(res.content[0]?.text as string)).toEqual(entries);
  });

  it('posts.list：缺省页宽 20·limit 值域收敛·cursor 透传进 ListPostsQuery', async () => {
    queryBus.execute.mockResolvedValue({ items: [], hasMore: false });
    await executor.execute('posts.list', cred, { limit: 500, cursor: 'c-9' });
    const query = queryBus.execute.mock.calls[0]?.[0];
    expect(query).toBeInstanceOf(ListPostsQuery);
    expect(query.request).toEqual({ limit: 100, cursor: 'c-9' });

    await executor.execute('posts.list', cred, {});
    expect(queryBus.execute.mock.calls[1]?.[0].request).toEqual({ limit: 20 });
  });

  it('posts.list：无活动租户（网关未绑 ALS）→ 拒且绝不派发的查询裸跑', async () => {
    tenant.requireActiveTenantId.mockImplementation(() => {
      throw new HttpException('No active tenant context', 403);
    });
    await expect(executor.execute('posts.list', cred, {})).rejects.toBeInstanceOf(HttpException);
    expect(queryBus.execute).not.toHaveBeenCalled();
  });

  // ── 切片 3：workspace.create 写支 ──

  it('workspace.create：租属通过→权限放行→嵌套 ALS 补 organizationId 后派 CreateWorkspaceCommand', async () => {
    queryBus.execute.mockResolvedValue(directory); // 目录校 org 归属
    commandBus.execute.mockResolvedValue({ id: 'W1', name: 'Proj', slug: 'proj' });
    const res = await executor.execute('workspace.create', writeCred, {
      name: 'Proj',
      slug: 'proj',
      organizationId: 'O1',
    });
    // 权限对称接 checker·类型级 create Workspace。
    expect(checker.can).toHaveBeenCalledWith({
      tenantId: 'T1',
      role: 'owner',
      action: 'create',
      subject: 'Workspace',
      userId: 'U1',
    });
    // 派发既有命令·入参仅 name/slug（org/tenant/owner 由 ALS+仓储盖章，command 不带身份轴）。
    const cmd = commandBus.execute.mock.calls[0]?.[0];
    expect(cmd).toBeInstanceOf(CreateWorkspaceCommand);
    expect(cmd).toMatchObject({ name: 'Proj', slug: 'proj' });
    // ALS 补轴：run 的第二参 ctx 携 organizationId。
    const runCtx = tenant.run.mock.calls[0]?.[0];
    expect(runCtx).toMatchObject({ tenantId: 'T1', userId: 'U1', organizationId: 'O1' });
    expect(JSON.parse(res.content[0]?.text as string)).toEqual({
      id: 'W1',
      name: 'Proj',
      slug: 'proj',
    });
  });

  it('workspace.create：organizationId 跨租/不存在（不在活动租目录）→ 403 且绝不派 command、不查权限', async () => {
    queryBus.execute.mockResolvedValue(directory); // 目录仅含 O1
    await expect(
      executor.execute('workspace.create', writeCred, {
        name: 'Proj',
        slug: 'proj',
        organizationId: 'OTHER-ORG', // 不在 T1 目录（跨租或不存在·同回执防枚举）
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(checker.can).not.toHaveBeenCalled(); // 归属校验前置于权限（早退）
  });

  it('workspace.create：权限裁决 deny（checker.can=false）→ 403 且不派 command', async () => {
    queryBus.execute.mockResolvedValue(directory);
    checker.can.mockResolvedValue(false);
    await expect(
      executor.execute('workspace.create', writeCred, {
        name: 'Proj',
        slug: 'proj',
        organizationId: 'O1',
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('workspace.create：缺 organizationId/name/slug 任一 → 400 且零派发', async () => {
    await expect(
      executor.execute('workspace.create', writeCred, { name: 'Proj', slug: 'proj' }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(queryBus.execute).not.toHaveBeenCalled();
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('workspace.create：无活动租户（网关未绑 ALS）→ fail-closed 拒·零查零派', async () => {
    tenant.requireActiveTenantId.mockImplementation(() => {
      throw new HttpException('No active tenant context', 403);
    });
    await expect(
      executor.execute('workspace.create', writeCred, {
        name: 'Proj',
        slug: 'proj',
        organizationId: 'O1',
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(queryBus.execute).not.toHaveBeenCalled();
    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});
