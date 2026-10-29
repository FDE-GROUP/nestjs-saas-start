import 'reflect-metadata';
import { IS_PUBLIC_KEY } from '@core/saas-kit/tenant-isolation/public.decorator';
import type { HealthCheckService } from '@nestjs/terminus';
import { getOpenAPIMeta } from '@orpc/openapi';
import { describe, expect, it, vi } from 'vitest';
import { HealthController, healthProcedureContract, pingOnly } from './health.controller';

/**
 * 存活探针回归测（oRPC 换轨 WP-A · DB-free）：锁三件运行时契约——
 * ①类级 @Public 豁免元数据仍可读回（全局会话墙+租户墙旁路的唯一依据·@Impl 保留 Nest 元数据）；
 * ②contract 的 openapi meta = GET /health（经全局前缀 `api` + URI 版本化 `v1` 落 /api/v1/health，
 *   与 Dockerfile HEALTHCHECK 口径逐字对应·路径合成本片已在真实 app 起服实测）；
 * ③ping-only 委托（空指示器数组 + 无版本/uptime 指纹，公网暴露面最小化）。
 */
describe('HealthController（存活探针 · oRPC）', () => {
  it('类级 @Public() 元数据可读回（会话墙+租户墙一条豁免）', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
  });

  it('contract openapi meta：GET /health（全局前缀+版本化后 = Dockerfile 探测的 /api/v1/health）', () => {
    const meta = getOpenAPIMeta(healthProcedureContract);
    expect(meta?.method).toBe('GET');
    expect(meta?.path).toBe('/health');
  });

  it('ping-only：check([]) 空指示器数组，响应无 version/uptime 类指纹', async () => {
    const check = vi.fn().mockResolvedValue({ status: 'ok', info: {}, error: {}, details: {} });
    const result = await pingOnly({ check } as unknown as HealthCheckService);
    expect(check).toHaveBeenCalledWith([]);
    expect(result).toMatchObject({ status: 'ok' });
    expect(JSON.stringify(result)).not.toMatch(/version|uptime/i);
  });
});
