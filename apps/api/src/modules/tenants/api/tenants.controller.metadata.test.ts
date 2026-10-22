import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { TenantsController } from './tenants.controller';

/**
 * REST 一致性核验片（项③）：锁建租门面各动作的响应状态码**元数据**——`@HttpCode` 不经直调 handler
 * 生效（单元测触不到），故走反射锁装饰器本身。`approve` 曾漏配 `@HttpCode` → 运行时默认 201 与
 * OpenAPI 文档 200 drift（激活既有 pending 租户·非新建资源，应 200）；本锁防回退并钉整面基线。
 */
const codeOf = (method: (...args: never[]) => unknown): number | undefined =>
  Reflect.getMetadata(HTTP_CODE_METADATA, method as unknown as object) as number | undefined;

describe('TenantsController 响应状态码（REST 一致性·项③）', () => {
  it('apply 201（建租申请=新建资源）', () => {
    expect(codeOf(TenantsController.prototype.apply)).toBe(HttpStatus.CREATED);
  });

  it('approve 200（激活既有 pending·非新建·对齐 OpenAPI 文档）', () => {
    expect(codeOf(TenantsController.prototype.approve)).toBe(HttpStatus.OK);
  });

  it('reject 204（驳回并弃·无响应体）', () => {
    expect(codeOf(TenantsController.prototype.reject)).toBe(HttpStatus.NO_CONTENT);
  });
});
