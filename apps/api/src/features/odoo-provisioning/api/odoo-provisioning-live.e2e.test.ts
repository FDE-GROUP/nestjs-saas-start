import { describe, expect, it } from 'vitest';
import type { ConfigService } from '../../../config/config.service';
import { OdooJsonClient } from '../../odoo-rpc-api/infrastructure/odoo-json.client';
import { expectedCompanyName } from '../application/odoo-provisioning.saga';
import { OdooJsonCompanyGateway } from '../infrastructure/odoo-json-company.gateway';

/**
 * 建司回找活体链 e2e（env-gated·真 Odoo·module-org-odoo-company-mapping 切片 C·§2.6）。
 *
 * 锁写侧网关的**活体真跑对拍**：`createCompany`（确定性命名）→ `findCompanyIdByName` 回找命中同一 id，
 * 坐实「命名回找幂等」在真实 `res.company` 上成立（骨架窗的核心不变量·saga 单测只能锁调用时序不能锁 Odoo 侧真语义）。
 *
 * **门**：`ODOO_E2E_BASE_URL` 未置即整体 skip（公共机器/无联调栈绿跳过·与 GATED_E2E_FILES 恒等闸协同——文件登记于清单、
 * feature 常驻本仓后文件恒在·跑否纯由本 env 门决定）。凭证 = 运行环境注入（**须 write scope**·见网关类头诚实边界），本文件不含任何真实凭证值。
 * 本地化/管理员预配两步在网关侧仍是带日志占位（联调窗补实），故本测只验可即刻对拍的 create/回找面，不覆盖深水区。
 */
const BASE_URL = process.env.ODOO_E2E_BASE_URL ?? '';
const describeLive = BASE_URL ? describe : describe.skip;

function liveClient(): OdooJsonClient {
  const env: Record<string, string> = {
    ODOO_BASE_URL: BASE_URL,
    ODOO_DB: process.env.ODOO_E2E_DB ?? 'odoo-demo',
    ODOO_LOGIN: process.env.ODOO_E2E_LOGIN ?? '',
    ODOO_API_KEY: process.env.ODOO_E2E_API_KEY ?? '',
  };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new OdooJsonClient(config);
}

describeLive('odoo-provisioning 活体链（真 Odoo·demo 实例·建司回找）', () => {
  it('createCompany（确定性命名）→ findCompanyIdByName 回找命中同 id', async () => {
    const client = liveClient();
    const gateway = new OdooJsonCompanyGateway(client);
    const name = expectedCompanyName(`live-${Date.now()}`);
    const companyId = await gateway.createCompany(name);
    expect(typeof companyId).toBe('number');
    expect(await gateway.findCompanyIdByName(name)).toBe(companyId);
    // 尽力清场（联调窗不留孤儿公司）：unlink 失败不影响断言结论。
    await client.executeKw('res.company', 'unlink', [[companyId]], {}).catch(() => undefined);
  });
});
