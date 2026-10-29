import { requestStorage } from '@core/saas-kit/shared-kernel/context/request-context';
import { describe, expect, it } from 'vitest';
import { errorEnvelopeFields } from './error-envelope-fields';

/**
 * 错误信封关联三字段单源 helper 单测（承换轨评审 M3）：
 * requestId 取值链 ALS → Fastify 原生 `req.id` → `'req-unknown'` 哨兵；path 缺省空串；
 * timestamp 恒为 ISO 串。REST 过滤器与 MCP 裸面共用此函数，此处即两面的共同卡尺。
 */
describe('errorEnvelopeFields（关联三字段单源）', () => {
  it('ALS 存在时 requestId 取 currentRequestId()，path/timestamp 来自请求', () => {
    requestStorage.run({ requestId: 'r-42' }, () => {
      const fields = errorEnvelopeFields({ url: '/api/v1/workspaces', id: 'req-native' });
      expect(fields.requestId).toBe('r-42');
      expect(fields.path).toBe('/api/v1/workspaces');
      expect(fields.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it('ALS 缺位回落 Fastify 原生 req.id', () => {
    const fields = errorEnvelopeFields({ url: '/mcp', id: 7 });
    expect(fields.requestId).toBe('7');
  });

  it('双缺位落 req-unknown 哨兵·path 缺省空串（仍满足契约必填）', () => {
    const fields = errorEnvelopeFields({});
    expect(fields.requestId).toBe('req-unknown');
    expect(fields.path).toBe('');
  });
});
