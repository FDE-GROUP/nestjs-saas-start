import { ListTenantDirectoryQuery } from '@app/modules/organizations/application/queries/list-tenant-directory.query';
import { ListPostsQuery } from '@app/modules/posts/application/queries/list-posts.query';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { HttpException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedMcpCredential } from '../../../modules/auth/application/ports/mcp-token-verifier.port';
import { McpToolExecutorService } from './mcp-tool-executor.service';

/**
 * MCP 工具执行壳单测（切片 2·纯 mock 总线零 DB·立「零第二套判据」卡尺）。
 *
 * 卡尺：①派发既有查询类且入参只取自**凭证盖章行**（调用侧 args 零身份可注入）；
 * ②posts.list 先过活动租户 fail-closed 卡点再查（ALS 未绑绝不裸查）；
 * ③页宽缺省/值域收敛/cursor 透传。真 ALS+总线链路由 gated e2e 承担。
 */
describe('McpToolExecutorService', () => {
  let queryBus: { execute: ReturnType<typeof vi.fn> };
  let tenant: { requireActiveTenantId: ReturnType<typeof vi.fn> };
  let executor: McpToolExecutorService;

  const cred: VerifiedMcpCredential = {
    credentialId: 'c1',
    tenantId: 'T1',
    userId: 'U1',
    name: 'cli',
    scopes: ['read'],
  };

  beforeEach(() => {
    queryBus = { execute: vi.fn() };
    tenant = { requireActiveTenantId: vi.fn().mockReturnValue('T1') };
    executor = new McpToolExecutorService(
      queryBus as unknown as QueryBus,
      tenant as unknown as TenantIsolationService,
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
});
