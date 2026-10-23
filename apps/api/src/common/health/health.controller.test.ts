import 'reflect-metadata';
import { IS_PUBLIC_KEY } from '@core/saas-kit/tenant-isolation/public.decorator';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { HealthCheckService } from '@nestjs/terminus';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';

/**
 * 存活探针回归测（module-common-health-probe·DB-free）：
 * 锁三件运行时契约——①类级 @Public 豁免元数据可读回（全局双墙旁路的唯一依据）；
 * ②路由元数据 health + GET（经全局前缀/版本化落 /api/v1/health，与 Dockerfile
 * HEALTHCHECK 口径逐字对应——本片修的正是「声明有、实现无」的断头路）；
 * ③ping-only 响应形态（空指示器数组 + 无版本/uptime 指纹，公网暴露面最小化）。
 */
describe('HealthController（存活探针）', () => {
  it('类级 @Public() 元数据可读回（会话墙+租户墙一条豁免）', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
  });

  it('路由元数据：GET health（全局前缀+版本化后 = Dockerfile 探测的 /api/v1/health）', () => {
    expect(Reflect.getMetadata(PATH_METADATA, HealthController)).toBe('health');
    const handler = HealthController.prototype.check;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/'); // @Get() 无参 → '/'
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });

  it('ping-only：check([]) 空指示器数组，响应无 version/uptime 类指纹', async () => {
    const check = vi.fn().mockResolvedValue({ status: 'ok', info: {}, error: {}, details: {} });
    const controller = new HealthController({ check } as unknown as HealthCheckService);
    const result = await controller.check();
    expect(check).toHaveBeenCalledWith([]);
    expect(result).toMatchObject({ status: 'ok' });
    expect(JSON.stringify(result)).not.toMatch(/version|uptime/i);
  });
});
