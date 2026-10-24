import { describe, expect, it } from 'vitest';
import { parseSsoClients } from './sso-clients';

describe('config · SSO client 注册表解析（oauth-sso-odoo-integration 切片 B）', () => {
  it('未配 / 空 → 空数组（fail-closed·authorize 缺省全拒）', () => {
    expect(parseSsoClients(undefined)).toEqual([]);
    expect(parseSsoClients('')).toEqual([]);
    expect(parseSsoClients('   ')).toEqual([]);
  });

  it('合法 JSON 数组 → 结构化注册表', () => {
    const clients = parseSsoClients(
      '[{"clientId":"odoo-1","redirectUris":["https://odoo/x"],"audience":"odoo-1"}]',
    );
    expect(clients).toHaveLength(1);
    expect(clients[0]?.clientId).toBe('odoo-1');
    expect(clients[0]?.redirectUris).toEqual(['https://odoo/x']);
  });

  it('结构非法（缺 audience / redirectUris 空）→ fail-loud 抛错', () => {
    expect(() =>
      parseSsoClients('[{"clientId":"odoo-1","redirectUris":["https://odoo/x"]}]'),
    ).toThrow();
    expect(() =>
      parseSsoClients('[{"clientId":"odoo-1","redirectUris":[],"audience":"a"}]'),
    ).toThrow();
  });

  it('非法 JSON → fail-loud（不静默退化成空）', () => {
    expect(() => parseSsoClients('not-json')).toThrow();
  });
});
