import { tenantIsolationStorage } from '@core/saas-kit/tenant-isolation/tenant-isolation-scope';
import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { Organization } from '../../modules/organizations/infrastructure/entities/ba-org.entities';
import { PostEntity } from '../../modules/posts/infrastructure/entities/post.entity';
import { TenantSubscription } from '../../modules/subscriptions/infrastructure/entities/tenant-subscription.entity';
import { Workspace } from '../../modules/workspaces/infrastructure/entities/workspace.entity';
import {
  applyTenantFilterParams,
  TENANT_ISOLATION_FILTER,
  tenantFilterArgsFromScope,
  tenantIsolationCondition,
} from './tenant-isolation-filter';

/**
 * 第三次复裁切片 1 · MikroORM 全局行级隔离 filter **机制单测**（DB-free 逻辑镜像·承 mikro-*-repository.test
 * 「镜像断言」纪律·不依赖真连接）。
 *
 * 锁死四条安全不变量（评审 pt6/pt9）：
 *  1. **跨租地板恒在**：有 tenantId 上下文即必挂 `tenantId=:t`（永不因 org 缺省而放宽跨租）。
 *  2. **fail-open 豁免**：无 ALS 租户上下文（平台治理/租户目录/seed/saga/迁移）→ `cond` 返回 `{}` 恒真不筛。
 *  3. **isolated 有 org → 追加 `organizationId`（AND 叠加·不做包含校验·越界即空）**；
 *     **isolated 无 org → fail-closed 不放宽**（只留租户地板·org 头不可伪造扩权）；
 *     **shared → 零 org 收窄**（存量默认互见·零行为变更）。
 *  4. **在册实体皆被机制覆盖**（「有列即被机制过滤」）：post/workspace/organization/tenant_subscription 四表
 *     运行实体登记同名 filter·`default:true`。
 */
describe('MikroORM 全局租户隔离 filter（切片 1 机制化）', () => {
  describe('tenantIsolationCondition · 谓词装配', () => {
    it('无 tenantId → {} 恒真不筛（跨租/无上下文豁免面命中此支）', () => {
      expect(tenantIsolationCondition({})).toEqual({});
      expect(tenantIsolationCondition()).toEqual({});
      expect(tenantIsolationCondition({ organizationId: 'orgA' })).toEqual({});
    });

    it('有 tenantId·shared 默认 → 仅挂租户地板（同租跨组织互见·零行为变更）', () => {
      expect(tenantIsolationCondition({ tenantId: 't1' })).toEqual({ tenantId: 't1' });
      // shared 即便带活动 org 也不收窄（orgIsolated=false）
      expect(tenantIsolationCondition({ tenantId: 't1', organizationId: 'orgA' })).toEqual({
        tenantId: 't1',
      });
    });

    it('isolated + 有 org → AND 叠加租户地板 + organizationId（越界 org 头不可伪造扩权）', () => {
      expect(
        tenantIsolationCondition({ tenantId: 't1', organizationId: 'orgA', orgIsolated: true }),
      ).toEqual({ tenantId: 't1', organizationId: 'orgA' });
    });

    it('isolated + 无 org → fail-closed 不放宽（只留租户地板·绝不因缺 org 而跨租或通配）', () => {
      expect(tenantIsolationCondition({ tenantId: 't1', orgIsolated: true })).toEqual({
        tenantId: 't1',
      });
    });
  });

  describe('tenantFilterArgsFromScope · ALS 作用域派生', () => {
    it('无 store → 全空（不筛豁免）', () => {
      expect(tenantIsolationStorage.getStore()).toBeUndefined();
      expect(tenantFilterArgsFromScope()).toEqual({});
    });

    it('有 tenantId/org 但缺 orgVisibility → orgIsolated=false（forward-compatible·shared 语义）', () => {
      tenantIsolationStorage.run({ tenantId: 't1', organizationId: 'orgA' }, () => {
        expect(tenantFilterArgsFromScope()).toEqual({
          tenantId: 't1',
          organizationId: 'orgA',
          orgIsolated: false,
        });
      });
    });

    it("orgVisibility='isolated' → orgIsolated=true（切片 3 落地后自动激活 org 收窄）", () => {
      const scope = {
        tenantId: 't1',
        organizationId: 'orgA',
        orgVisibility: 'isolated',
      } as never;
      tenantIsolationStorage.run(scope, () => {
        expect(tenantFilterArgsFromScope().orgIsolated).toBe(true);
      });
    });
  });

  describe('applyTenantFilterParams · em 装配', () => {
    it('以 filter 名单点写 setFilterParams（scoped fork 传派生参·scoped:false 传 {}）', () => {
      const calls: [string, Record<string, unknown>][] = [];
      const em = {
        setFilterParams: (name: string, args: Record<string, unknown>) => calls.push([name, args]),
      } as unknown as EntityManager;

      applyTenantFilterParams(em, { tenantId: 't1', organizationId: 'orgA', orgIsolated: true });
      applyTenantFilterParams(em, {});

      expect(calls).toEqual([
        [TENANT_ISOLATION_FILTER, { tenantId: 't1', organizationId: 'orgA', orgIsolated: true }],
        [TENANT_ISOLATION_FILTER, {}],
      ]);
    });
  });

  describe('在册实体登记覆盖（有列即被机制过滤）', () => {
    const registered = [
      ['Post', PostEntity],
      ['Organization', Organization],
      ['Workspace', Workspace],
      ['TenantSubscription', TenantSubscription],
    ] as const;

    for (const [label, entity] of registered) {
      it(`${label} 运行实体携带 tenantIsolation filter·default:true`, () => {
        // `_meta` 系 EntitySchema 私字段·经 `unknown` 绕开静态可见性（运行时 defineEntity/buildRuntimeEntity 皆实装）。
        const meta = (
          entity as unknown as {
            _meta?: { filters?: Record<string, { default?: boolean }> };
          }
        )._meta;
        expect(meta?.filters?.[TENANT_ISOLATION_FILTER]).toBeDefined();
        expect(meta?.filters?.[TENANT_ISOLATION_FILTER]?.default).toBe(true);
      });
    }
  });
});
