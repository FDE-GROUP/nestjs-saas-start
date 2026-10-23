import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { SkipThrottle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { AuthModule } from '../modules/auth/auth.module';
import { TenantIsolationModule } from '../tenant-isolation/tenant-isolation.module';
import { buildFastifyHttpOptions } from './fastify-http-options';
import { HealthController } from './health/health.controller';
import { RATE_LIMIT_DEFAULT, RateLimitModule } from './rate-limit.module';

/**
 * 请求限流墙锁测（module-common-rate-limit·甲–丁裁·DoD 单元/行为面）：
 * 1) 窗值/守卫形态/可编译（丙裁 300 次/60s 单源锚·S9 DI 值导入防线）；
 * 2) AppModule 执行序：限流墙 < 会话墙(401) < 租户墙(403)（甲裁接线）；
 * 3) health 豁免元数据在场（甲裁探活不被锁）；
 * 4) 行为真 app（DB-free 迷你装配·小窗 limit=2）：超限 429 + X-Throttler 头 +
 *    `@SkipThrottle()` 类不受自身桶计数；
 * 5) trustProxy 透传四态（乙裁与 BA 同源·未配不传保持直连安全默认）。
 */

describe('RateLimitModule 形状锁（甲/丙裁）', () => {
  it('窗值单源 = 300 次/60_000ms（丙裁宽档·throttler v6 ttl 毫秒）', () => {
    expect(RATE_LIMIT_DEFAULT).toEqual({ ttl: 60_000, limit: 300 });
  });

  it('APP_GUARD useClass ThrottlerGuard（全局墙·值导入不被擦除）', () => {
    const providers = Reflect.getMetadata('providers', RateLimitModule) as Array<{
      provide: unknown;
      useClass?: unknown;
    }>;
    const guardProvider = providers.find((p) => p.provide === APP_GUARD);
    expect(guardProvider?.useClass).toBe(ThrottlerGuard);
  });

  it('RateLimitModule 可独立装配（compile 即实例化全部 provider·DI 缺依赖会抛）', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [RateLimitModule] }).compile();
    // APP_GUARD 是 enhancer 令牌（applicationConfig 收集，不可 get）；守卫形态由上方
    // providers 元数据锁 + 此处整链实例化成功共同作证（同 S9 未知依赖炸法）。
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });

  it('AppModule 执行序：限流墙 先于 会话墙(401) 先于 租户墙(403)', () => {
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
    const idx = (m: unknown) =>
      imports.findIndex(
        (x) =>
          x === m ||
          (typeof x === 'object' && x !== null && (x as { module?: unknown }).module === m),
      );
    expect(idx(RateLimitModule)).toBeGreaterThanOrEqual(0);
    expect(idx(RateLimitModule)).toBeLessThan(idx(AuthModule));
    expect(idx(AuthModule)).toBeLessThan(idx(TenantIsolationModule));
  });

  it('health 探针类级 @SkipThrottle 元数据在场（探活/verify-prod-boot 不被锁）', () => {
    const keys = Reflect.getMetadataKeys(HealthController) as string[];
    expect(keys.some((k) => k.startsWith('THROTTLER:SKIP'))).toBe(true);
  });
});

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return 'ok';
  }
}

@SkipThrottle()
@Controller('open')
class OpenController {
  @Get()
  open() {
    return 'ok';
  }
}

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 2 }] })],
  controllers: [PingController, OpenController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class WallTestModule {}

@Controller('p2')
class P2Controller {
  @Get()
  p2() {
    return 'ok';
  }
}

@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 2 }] })],
  controllers: [P2Controller],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ProxyTestModule {}

describe('限流墙行为（真 Nest+Fastify·DB-free 小窗）', () => {
  let app: NestFastifyApplication;
  let server: FastifyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [WallTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    server = app.getHttpAdapter().getInstance() as unknown as FastifyInstance;
    await server.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('同端点 2 通过 → 第 3 击 429（deny-by-default·守卫抛错路径不写 X-Throttler 头）', async () => {
    for (const _ of [1, 2]) {
      const res = await server.inject({ method: 'GET', url: '/ping' });
      expect(res.statusCode).toBe(200);
    }
    const denied = await server.inject({ method: 'GET', url: '/ping' });
    expect(denied.statusCode).toBe(429);
    expect(JSON.parse(denied.body).statusCode).toBe(429);
  });

  it('@SkipThrottle() 类不受计数（同端点连击 4 次全 200·health 豁免同构证明）', async () => {
    for (const _ of [1, 2, 3, 4]) {
      const res = await server.inject({ method: 'GET', url: '/open' });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe('反代下按真客户端 IP 分桶（乙裁对拍·trustProxy 启用链）', () => {
  let app: NestFastifyApplication;
  let server: FastifyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProxyTestModule] }).compile();
    // 与 main.ts 同源装配：FastifyAdapter(buildFastifyHttpOptions(...))，假想反代 socket
    // 127.0.0.1 可信，XFF 最右解出真客户端（@fastify/proxy-addr 链）。
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(buildFastifyHttpOptions('127.0.0.1')),
    );
    await app.init();
    server = app.getHttpAdapter().getInstance() as unknown as FastifyInstance;
    await server.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('两个 XFF 真 IP 各自成桶：8.8.8.8 打穿 429 后 9.9.9.9 仍可过（共享桶误杀反证）', async () => {
    for (const _ of [1, 2]) {
      const res = await server.inject({
        method: 'GET',
        url: '/p2',
        headers: { 'x-forwarded-for': '8.8.8.8' },
      });
      expect(res.statusCode).toBe(200);
    }
    const denied = await server.inject({
      method: 'GET',
      url: '/p2',
      headers: { 'x-forwarded-for': '8.8.8.8' },
    });
    expect(denied.statusCode).toBe(429);
    // 另一真 IP 不受波及（若未启用 trustProxy 则全落 socket 127.0.0.1 单桶→此击必 429）。
    const other = await server.inject({
      method: 'GET',
      url: '/p2',
      headers: { 'x-forwarded-for': '9.9.9.9' },
    });
    expect(other.statusCode).toBe(200);
  });
});

describe('buildFastifyHttpOptions trustProxy 透传（乙裁同源·四态）', () => {
  it('未配/空/全空白 → 不传 trustProxy 键（保持直连 socket IP 安全默认）', () => {
    for (const v of [undefined, '', ' , , ']) {
      const opts = buildFastifyHttpOptions(v);
      // logger 现为按 NODE_ENV 选型的 pino 选项对象（dev pretty / prod JSON），不再是布尔 true。
      expect(typeof opts.logger).toBe('object');
      expect('trustProxy' in (opts as object)).toBe(false);
    }
  });

  it('单值/多值逗号 CIDR → 数组透传（Fastify 5 @fastify/proxy-addr compile 语义）', () => {
    expect(buildFastifyHttpOptions('127.0.0.1')).toMatchObject({
      trustProxy: ['127.0.0.1'],
    });
    expect(buildFastifyHttpOptions(' 172.16.0.0/12 , loopback ')).toMatchObject({
      trustProxy: ['172.16.0.0/12', 'loopback'],
    });
  });
});
