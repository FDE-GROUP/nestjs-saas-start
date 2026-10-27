import 'reflect-metadata';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  TENANT_RBAC_REPOSITORY,
  type TenantRbacRepository,
} from '@app/modules/authorization/domain/repositories/organization-rbac.repository';
import {
  TenantRole,
  TenantRoleGrant,
} from '@app/modules/authorization/infrastructure/entities/rbac.entities';
import { Organization } from '@app/modules/organizations/infrastructure/entities/ba-org.entities';
import { Tenant } from '@app/modules/organizations/infrastructure/entities/tenant.entity';
import {
  PERMISSION_CHECKER,
  type PermissionChecker,
} from '@core/saas-kit/authorization/permission.port';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * RBAC grant 组织收窄维 **真库端到端**（第三次层级复裁 切片 2·D1·env-gated）。
 *
 * 证真「org-scoped grant 只在本 org 生效·租级通配跨 org」——直接钉死 `findGrants` 的
 * 「租级通配（organizationId IS NULL）∪ 本 org」适用集谓词与 CASL 裁决在真实 `tenant_role_grant.organizationId`
 * 列上的形为（本片切片 2 复活组织权限维的验收面）。安全底线复证：`tenantId` 仍是永不放松的跨租硬地板。
 *
 * 夹具：一租户 T 下两组织 org1/org2·自定义角色 `orgadmin` 携两行 grant——
 *  - 通配行 `organizationId=NULL`：`Workspace:read`（整 subject 级·conditions=null·跨 org 生效）；
 *  - org 收窄行 `organizationId=org1`：`Workspace:update`（整 subject 级·仅 org1 生效）。
 * 经真实 `PERMISSION_CHECKER`（`CaslPermissionChecker` → `MikroTenantRbacRepository.findGrants`）判定：
 *  - update@org1 → 放行（本 org 收窄命中）；
 *  - update@org2 → 拒（org 收窄不外溢他 org·fail-closed）；
 *  - update@无 org → 拒（org-scoped 行不参与租级上下文裁决）；
 *  - read@org1/org2/无 org → 皆放行（租级通配跨 org 恒生效）；
 *  - 另租户 T2 同 key 无授权 → 拒（跨租恒不可见·主轴不松）。
 *
 * **默认跳过**：仅 `E2E_DATABASE_URL` 存在时运行（开关）·连接串取 `DATABASE_URL`——对齐既有 gated 纪律；
 * 夹具 afterAll 清净·时间戳后缀保幂等。全程无 ALS 上下文（`mikro.fork()` 全局 filter 惰性恒真·见切片 1），
 * org 维裁决由仓储显式谓词承担（正证 D1 逻辑本身）。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('RBAC grant 组织收窄端到端（D1·org-scoped grant vs 租级通配 · env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  let checker: PermissionChecker;
  let rbac: TenantRbacRepository;

  const stamp = Date.now();
  const tenantId = uuidv7();
  const org1 = uuidv7();
  const org2 = uuidv7();
  const tenant2 = uuidv7();
  let roleId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    mikro = app.get(MikroOrmService);
    checker = app.get<PermissionChecker>(PERMISSION_CHECKER);
    rbac = app.get<TenantRbacRepository>(TENANT_RBAC_REPOSITORY);
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    const em = await mikro.fork();
    // grant 携 organizationId FK→organization cascade·先撤 grant 再撤 role·末清 org/tenant。
    await em.nativeDelete(TenantRoleGrant, { roleId } as never);
    await em.nativeDelete(TenantRole, { id: { $in: [roleId] } } as never);
    await em.nativeDelete(Organization, { id: { $in: [org1, org2] } } as never);
    await em.nativeDelete(Tenant, { id: { $in: [tenantId, tenant2] } } as never);
    await app.close();
  });

  it('org-scoped grant 只在本 org 生效·租级通配跨 org·跨租恒不可见', async () => {
    const now = new Date();
    const em = await mikro.fork();
    await em.insert(Tenant, [
      {
        id: tenantId,
        name: `E2E GrantOrg ${stamp}`,
        slug: `e2e-grant-org-${stamp}`,
        status: 'active',
        createdAt: now,
        updatedAt: null,
      },
      {
        id: tenant2,
        name: `E2E GrantOrg T2 ${stamp}`,
        slug: `e2e-grant-org-t2-${stamp}`,
        status: 'active',
        createdAt: now,
        updatedAt: null,
      },
    ] as never);
    await em.insert(Organization, [
      {
        id: org1,
        tenantId,
        name: `E2E GOrg1 ${stamp}`,
        slug: `e2e-gorg1-${stamp}`,
        createdAt: now,
        updatedAt: null,
      },
      {
        id: org2,
        tenantId,
        name: `E2E GOrg2 ${stamp}`,
        slug: `e2e-gorg2-${stamp}`,
        createdAt: now,
        updatedAt: null,
      },
    ] as never);

    // 自定义租级角色 orgadmin（tenant_role 目录仍纯租级·unique(tenantId,key)）。
    roleId = uuidv7();
    await em.insert(TenantRole, {
      id: roleId,
      tenantId,
      key: 'orgadmin',
      name: 'Org Admin',
      isSystem: false,
      createdAt: now,
      updatedAt: null,
    } as never);
    // 通配行（organizationId 省略 → NULL）：Workspace:read·跨 org 生效。
    await em.insert(TenantRoleGrant, {
      roleId,
      subject: 'Workspace',
      action: 'read',
      conditions: null,
      createdAt: now,
    } as never);
    // org 收窄行（organizationId=org1）：Workspace:update·仅 org1 生效。
    await em.insert(TenantRoleGrant, {
      roleId,
      organizationId: org1,
      subject: 'Workspace',
      action: 'update',
      conditions: null,
      createdAt: now,
    } as never);
    await em.flush();

    // — org-scoped update：本 org 命中·他 org 拒·无 org 拒（org 维不外溢·fail-closed）。
    await expect(
      checker.can({
        tenantId,
        role: 'orgadmin',
        action: 'update',
        subject: 'Workspace',
        organizationId: org1,
      }),
    ).resolves.toBe(true);
    await expect(
      checker.can({
        tenantId,
        role: 'orgadmin',
        action: 'update',
        subject: 'Workspace',
        organizationId: org2,
      }),
    ).resolves.toBe(false);
    await expect(
      checker.can({ tenantId, role: 'orgadmin', action: 'update', subject: 'Workspace' }),
    ).resolves.toBe(false);

    // — 租级通配 read：本 org / 他 org / 无 org 皆生效（NULL 通配跨 org）。
    await expect(
      checker.can({
        tenantId,
        role: 'orgadmin',
        action: 'read',
        subject: 'Workspace',
        organizationId: org1,
      }),
    ).resolves.toBe(true);
    await expect(
      checker.can({
        tenantId,
        role: 'orgadmin',
        action: 'read',
        subject: 'Workspace',
        organizationId: org2,
      }),
    ).resolves.toBe(true);
    await expect(
      checker.can({ tenantId, role: 'orgadmin', action: 'read', subject: 'Workspace' }),
    ).resolves.toBe(true);

    // — 跨租硬地板复证：另一租户同 key 无任何授权 → 全拒（tenantId 永不放松）。
    await expect(
      checker.can({
        tenantId: tenant2,
        role: 'orgadmin',
        action: 'read',
        subject: 'Workspace',
        organizationId: org1,
      }),
    ).resolves.toBe(false);

    // — P0 X6 管理面全量回显：`listAllGrantsForRole` 不加 org 过滤·取该角色名下**全部**行并回显 organizationId。
    //   （区别于 `findGrants` 无活动 org 时仅回通配行·此处应见两行：通配 read(null) + org 收窄 update(org1)。）
    const adminGrants = await rbac.listAllGrantsForRole(tenantId, 'orgadmin');
    expect(adminGrants).not.toBeNull();
    const byOrg = new Map(adminGrants?.map((g) => [g.action, g.organizationId]));
    expect(byOrg.get('read')).toBeNull(); // 租级通配行回显 null
    expect(byOrg.get('update')).toBe(org1); // org 收窄行回显归属 org1
    expect(adminGrants).toHaveLength(2);
    // 对照：CASL 适用集 `findGrants`（无活动 org）仅取通配行——org 收窄行不参与租级裁决（fail-closed）。
    const caslGrants = await rbac.findGrants(tenantId, 'orgadmin');
    expect(caslGrants).toHaveLength(1);
    expect(caslGrants?.[0]?.action).toBe('read');
  }, 60000);
});
