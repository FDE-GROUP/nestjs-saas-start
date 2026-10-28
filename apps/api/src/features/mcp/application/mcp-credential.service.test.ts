import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  McpAccessTokenMintInput,
  McpAccessTokenStore,
} from '../../../modules/auth/application/ports/mcp-access-token-store.port';
import { McpCredentialService } from './mcp-credential.service';

/**
 * MCP 凭证编排服务单测（module-mcp-agent-surface 切片 1·纯 mock 端口零 DB）。
 *
 * 卡尺三面：①明文永不落库（store 只收哈希/prefix）②TTL 策略（缺省 90 天/显式选定）
 * ③撤销不可见=404 且错误码走 ERROR_CODES 单源 object 形。
 */
describe('McpCredentialService', () => {
  let store: {
    create: ReturnType<typeof vi.fn>;
    listByOwner: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };
  let service: McpCredentialService;

  beforeEach(() => {
    store = { create: vi.fn(), listByOwner: vi.fn(), revoke: vi.fn() };
    service = new McpCredentialService(store as unknown as McpAccessTokenStore);
  });

  const rowFixture = {
    id: 'r1',
    name: 'cli',
    scopes: ['read'],
    tokenPrefix: 'mcp_deadbeef',
    expiresAt: new Date('2027-01-01'),
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date('2026-10-28'),
  };

  it('mint：store 只收 sha256 哈希与辨认前缀，明文仅响应一次', async () => {
    store.create.mockImplementation(async (input: McpAccessTokenMintInput) => ({
      ...rowFixture,
      ...input,
    }));
    const before = Date.now();
    const res = await service.mint({ name: 'cli', scopes: ['read'] }, 'u1');

    expect(res.token).toMatch(/^mcp_[0-9a-f]{64}$/);
    const input = store.create.mock.calls[0]?.[0] as McpAccessTokenMintInput;
    // 明文不可能出现在落库输入（结构性无 token 字段·键集对拍兜住后续加列退化）。
    expect(Object.keys(input).sort()).toEqual(
      ['expiresAt', 'name', 'scopes', 'tokenHash', 'tokenPrefix', 'userId'].sort(),
    );
    expect(input.tokenHash).toBe(createHash('sha256').update(res.token).digest('hex'));
    expect(input.tokenPrefix).toBe(res.token.slice(0, 12));
    // 缺省 TTL=90 天（±时钟抖动容差）。
    const ttlDays = (input.expiresAt.getTime() - before) / 86_400_000;
    expect(ttlDays).toBeGreaterThan(89.9);
    expect(ttlDays).toBeLessThan(90.2);
  });

  it('mint：显式 expiresInDays 覆写策略缺省', async () => {
    store.create.mockImplementation(async (input: McpAccessTokenMintInput) => ({
      ...rowFixture,
      ...input,
    }));
    await service.mint({ name: 'ci', scopes: ['read', 'write'], expiresInDays: 7 }, 'u1');
    const input = store.create.mock.calls[0]?.[0] as McpAccessTokenMintInput;
    expect(input.scopes).toEqual(['read', 'write']);
    const days = (input.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('list：行视图 items 形且映射保留撤销/未用 null 语义', async () => {
    store.listByOwner.mockResolvedValue([
      { ...rowFixture, lastUsedAt: undefined, revokedAt: new Date('2026-10-27') },
    ]);
    const res = await service.list('u1');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.lastUsedAt).toBeNull();
    expect(res.items[0]?.revokedAt).toEqual(new Date('2026-10-27'));
    expect(store.listByOwner).toHaveBeenCalledWith('u1');
  });

  it('revoke：未命中抛 404 object 形·错误码单源', async () => {
    store.revoke.mockResolvedValue(false);
    await expect(service.revoke('u1', 'nope')).rejects.toBeInstanceOf(HttpException);
    store.revoke.mockResolvedValue(false);
    await expect(service.revoke('u1', 'nope')).rejects.toMatchObject({
      status: 404,
      response: { errorCode: 'MCP:CREDENTIAL_NOT_FOUND' },
    });
  });

  it('revoke：命中即成功（幂等语义归 store·服务零追问）', async () => {
    store.revoke.mockResolvedValue(true);
    await expect(service.revoke('u1', 'r1')).resolves.toBeUndefined();
    expect(store.revoke).toHaveBeenCalledWith('u1', 'r1');
  });
});
