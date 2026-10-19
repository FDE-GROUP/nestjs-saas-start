import 'reflect-metadata';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { listPageQuerySchema } from '@saas/contracts/index';
import { describe, expect, it } from 'vitest';
import { WorkspacesController } from './workspaces.controller';

// S4/S5 换轨后 list() 的校验凭 `@Query({ schema })` 路由参数元数据生效（不再依赖 class DTO 的
// design:paramtypes）——锁「schema 已挂到 @Query 参数元数据」，复刻旧 paramtypes 锁的本职：
// 防漏配/import type 致 limit/offset 校验整链静默跳过（S9 同形风险的 schema 侧等价守卫）。
describe('WorkspacesController query schema metadata', () => {
  it('list() 的 @Query 携 listPageQuerySchema（S4 schema 路径·非 class DTO）', () => {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, WorkspacesController, 'list') as Record<
      string,
      { schema?: unknown }
    >;
    expect(Object.values(args).some((v) => v.schema === listPageQuerySchema)).toBe(true);
  });
});
