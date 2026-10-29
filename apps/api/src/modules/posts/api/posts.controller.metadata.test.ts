import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { getOpenAPIMeta } from '@orpc/openapi';
import {
  createPostSchema,
  listPostsQuerySchema,
  postCursorPageSchema,
  postViewSchema,
} from '@saas/contracts/index';
import { describe, expect, it } from 'vitest';
import { PostsController, postsCreateContract, postsListContract } from './posts.controller';

/**
 * 换轨 WP-B parity 锁（posts·S4 schema 路径 + S7b 序列化白名单 + 路由注册的 oRPC 等价承接）：
 *
 * 旧 REST 三件静默失守防线（`@Query({schema})` 参数元数据 / `@SerializeOptions` 类序列化元数据）
 * 在 oRPC 下换了落点——校验与 PII 白名单下沉到 procedure 级 `.input/.output`，路由经 `@Impl` 的
 * contract `openapi` meta 注册。本测锁等价不变量，复刻旧测本职：
 * ① contract 携 zod 单源 schema（input=请求校验·output=序列化白名单），漏配即 TS 型变 + 此红；
 * ② `@Impl` 确把 HTTP 动词语义落到 contract openapi meta（GET/POST + successStatus）；
 * ③ `@Impl` 确在**同一 controller 方法**上落了 Nest 路由元数据（非 router 扇出生成派生方法）——
 *   这是 class 级守卫（TenantIsolationGuard）与 `@Can` 仍逐路由生效、guard-wiring 扫描器仍识别的前提。
 */
interface SchemasDef {
  inputSchemas?: readonly unknown[];
  outputSchemas?: readonly unknown[];
}

function schemasOf(contract: object): SchemasDef {
  return (contract as { '~orpc': SchemasDef })['~orpc'];
}

describe('PostsController oRPC contract parity（S4 校验 + S7b 白名单 + 路由注册）', () => {
  it('list contract：input=listPostsQuerySchema·output=postCursorPageSchema（S4/S7b 单源承接）', () => {
    const def = schemasOf(postsListContract);
    expect(def.inputSchemas).toContain(listPostsQuerySchema);
    expect(def.outputSchemas).toContain(postCursorPageSchema);
  });

  it('create contract：input=createPostSchema·output=postViewSchema（S4/S7b 单源承接）', () => {
    const def = schemasOf(postsCreateContract);
    expect(def.inputSchemas).toContain(createPostSchema);
    expect(def.outputSchemas).toContain(postViewSchema);
  });

  it('contract openapi meta：list=GET /posts·create=POST /posts 201（路径/动词语义等价旧 REST）', () => {
    const list = getOpenAPIMeta(postsListContract);
    expect(list?.method).toBe('GET');
    expect(list?.path).toBe('/posts');
    const create = getOpenAPIMeta(postsCreateContract);
    expect(create?.method).toBe('POST');
    expect(create?.path).toBe('/posts');
    expect(create?.successStatus).toBe(201);
  });

  it('@Impl 把路由元数据落在 list/create 方法本身（非派生方法·class 守卫与 @Can 逐路由生效的前提）', () => {
    const proto = PostsController.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata(PATH_METADATA, proto.list)).toBe('/posts');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.list)).toBe(0); // GET
    expect(Reflect.getMetadata(PATH_METADATA, proto.create)).toBe('/posts');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.create)).toBe(1); // POST
  });
});
