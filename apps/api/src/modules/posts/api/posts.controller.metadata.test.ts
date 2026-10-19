import 'reflect-metadata';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CLASS_SERIALIZER_OPTIONS } from '@nestjs/common/serializer/class-serializer.constants.js';
import { listCursorQuerySchema, postCursorPageSchema, postViewSchema } from '@saas/contracts/index';
import { describe, expect, it } from 'vitest';
import { PostsController } from './posts.controller';

// S4/S5 换轨后 list() 的校验凭 `@Query({ schema })` 路由参数元数据生效（不再依赖 class DTO 的
// design:paramtypes）——锁「schema 已挂到 @Query 参数元数据」，复刻旧 paramtypes 锁的本职：
// 防漏配/import type 致 limit/cursor 校验整链静默跳过（S9 同形风险的 schema 侧等价守卫）。
describe('PostsController query schema metadata', () => {
  it('list() 的 @Query 携 listCursorQuerySchema（S4 schema 路径·非 class DTO）', () => {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, PostsController, 'list') as Record<
      string,
      { schema?: unknown }
    >;
    expect(Object.values(args).some((v) => v.schema === listCursorQuerySchema)).toBe(true);
  });

  // S7b 白名单序列化：官方 StandardSchemaSerializerInterceptor 经 getAllAndOverride 读
  // CLASS_SERIALIZER_OPTIONS（方法级 SetMetadata 落 descriptor.value）——锁「@SerializeOptions 已挂且
  // 指向契约单源 schema」。fail-open 序列化器无 schema 那么原样透传（不剥 PII）→漏配静默安整白名单链。
  it('list() 携 @SerializeOptions(postCursorPageSchema)（S7b 序列化白名单）', () => {
    const opts = Reflect.getMetadata(
      CLASS_SERIALIZER_OPTIONS,
      PostsController.prototype.list as object,
    ) as { schema?: unknown };
    expect(opts?.schema).toBe(postCursorPageSchema);
  });

  it('create() 携 @SerializeOptions(postViewSchema)（S7b 序列化白名单）', () => {
    const opts = Reflect.getMetadata(
      CLASS_SERIALIZER_OPTIONS,
      PostsController.prototype.create as object,
    ) as { schema?: unknown };
    expect(opts?.schema).toBe(postViewSchema);
  });
});
