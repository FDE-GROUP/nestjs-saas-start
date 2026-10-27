import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import type { AuthSessionStore } from '@app/modules/auth/domain/ports/session-store.port';
import type {
  OrganizationOdooBindingReader,
  OrganizationOdooBindingRow,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import type { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TenantMemberFacadeService } from '../application/tenant-member-facade.service';
import { OrganizationsOrgAdminController } from './organizations-org-admin.controller';
import { OrganizationsSelfController } from './organizations-self.controller';

/**
 * 成员/邀请门面单测（module-rbac-casl §2.3.1·甲裁严格拆 · module-rbac-dynamic-roles S3 存在性闸）：
 * 门面对 BA 服务端窄门面的**委派形状**（headers/body/query 透传）与 BA 错误归一
 * （4xx 透传状态·未知/5xx 原样上抛不伪装），以及 S3 新增的**角色可挂载存在性闸**
 * （不可挂载→400 且不触 BA）。@Can 授权裁决由 guard 链锁测覆盖，此处不重复。
 */

function instanceWith(api: Record<string, unknown>): InjectAuthInstance {
  return { get: () => ({ api }) as never, set: () => {} } as unknown as InjectAuthInstance;
}

/** 角色可挂载读端口桩已随管理门面换轴（守卫语义上收 TenantMemberFacadeService·其单测另行覆盖）。 @internal */

const HEADERS = { cookie: 'session=abc' };

/** Odoo 绑定读端口桩（缺省查无绑定·odooAvailability 委派用）。 @internal */
function bindingsStub(
  row: OrganizationOdooBindingRow | null = null,
): OrganizationOdooBindingReader {
  return { read: vi.fn().mockResolvedValue(row) } as unknown as OrganizationOdooBindingReader;
}

/** 租户软读桩（缺省无活跃租户）。 @internal */
function tenantStub(organizationId?: string): TenantIsolationService {
  return { organizationId } as unknown as TenantIsolationService;
}

/** 会话租位写端口桩（P0 X2 双激活位互斥·clearActiveTenant 缺省 no-op）。 @internal */
function sessionsStub(): AuthSessionStore {
  return {
    deleteAllForUser: vi.fn().mockResolvedValue(0),
    setActiveTenant: vi.fn().mockResolvedValue(0),
    clearActiveTenant: vi.fn().mockResolvedValue(0),
  } as unknown as AuthSessionStore;
}

/** 租级成员/邀请门面桩（X7 个人通道 accept/reject/mine 委派·缺省返入租替身）。 @internal */
function selfFacadeStub(): TenantMemberFacadeService {
  return {
    acceptInvitation: vi.fn().mockResolvedValue({ tenantId: 't1', roleKey: 'member' }),
    rejectInvitation: vi.fn().mockResolvedValue(undefined),
    listMyInvitations: vi.fn().mockResolvedValue([]),
  } as unknown as TenantMemberFacadeService;
}

describe('OrganizationsOrgAdminController（管理门面·X7 租级化：纯委派 TenantMemberFacadeService）', () => {
  // 控制器已换轴为租级门面的薄委派层：@Can/CASL 授权由 guard 链锁测覆盖，
  // 角色可挂载/last-owner/self-removal/席位卡点等守卫语义上收门面（其单测另行覆盖），
  // 此处只验「端点形状 → facade 调用坐标」与「4xx 拒因原样上抛不伪装」。
  function facadeStub() {
    return {
      listMembers: vi.fn().mockResolvedValue([{ userId: 'u1', roleKey: 'member' }]),
      updateMemberRole: vi.fn().mockResolvedValue(undefined),
      removeMember: vi.fn().mockResolvedValue(undefined),
      listInvitations: vi.fn().mockResolvedValue([]),
      createInvitation: vi.fn().mockResolvedValue(undefined),
      cancelInvitation: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('listMembers 委派 facade.listMembers()', async () => {
    const facade = facadeStub();
    const ctrl = new OrganizationsOrgAdminController(facade as never);
    await expect(ctrl.listMembers()).resolves.toEqual([{ userId: 'u1', roleKey: 'member' }]);
    expect(facade.listMembers).toHaveBeenCalledOnce();
  });

  it('updateMemberRole 委派（memberId 视作 userId）并回 ok', async () => {
    const facade = facadeStub();
    const ctrl = new OrganizationsOrgAdminController(facade as never);
    await expect(
      ctrl.updateMemberRole({ memberId: 'u1', role: 'admin' } as never),
    ).resolves.toEqual({ ok: true });
    expect(facade.updateMemberRole).toHaveBeenCalledWith('u1', 'admin');
  });

  it('removeMember 委派（memberId 视作 userId）', async () => {
    const facade = facadeStub();
    const ctrl = new OrganizationsOrgAdminController(facade as never);
    await expect(ctrl.removeMember({ memberId: 'u1' } as never)).resolves.toEqual({ ok: true });
    expect(facade.removeMember).toHaveBeenCalledWith('u1');
  });

  it('createInvitation 委派 email+role', async () => {
    const facade = facadeStub();
    const ctrl = new OrganizationsOrgAdminController(facade as never);
    await expect(
      ctrl.createInvitation({ email: 'a@b.c', role: 'member' } as never),
    ).resolves.toEqual({ ok: true });
    expect(facade.createInvitation).toHaveBeenCalledWith('a@b.c', 'member');
  });

  it('cancelInvitation 委派 invitationId', async () => {
    const facade = facadeStub();
    const ctrl = new OrganizationsOrgAdminController(facade as never);
    await expect(ctrl.cancelInvitation({ invitationId: 'inv-1' } as never)).resolves.toEqual({
      ok: true,
    });
    expect(facade.cancelInvitation).toHaveBeenCalledWith('inv-1');
  });

  it('门面守卫拒绝（不可挂载角色 → 400）原样上抛不伪装', async () => {
    const facade = facadeStub();
    facade.updateMemberRole.mockRejectedValue(new BadRequestException('Role not assignable'));
    const ctrl = new OrganizationsOrgAdminController(facade as never);
    await expect(
      ctrl.updateMemberRole({ memberId: 'u1', role: 'ghost' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('OrganizationsSelfController（个人通道门面·X7 邀请面换自有 tenant_invitation·setActive 仍 BA）', () => {
  it('listMyInvitations 委派门面（以会话用户 email 收敛可见面）', async () => {
    const facade = selfFacadeStub();
    const ctrl = new OrganizationsSelfController(
      instanceWith({}),
      bindingsStub(),
      tenantStub(),
      sessionsStub(),
      facade,
    );
    await ctrl.listMyInvitations({ id: 'u1', email: 'me@acme.com' });
    expect(facade.listMyInvitations).toHaveBeenCalledWith('me@acme.com');
  });

  it('acceptInvitation 委派门面（受邀主体取自会话用户·席位/邮箱守卫在门面）', async () => {
    const facade = selfFacadeStub();
    const ctrl = new OrganizationsSelfController(
      instanceWith({}),
      bindingsStub(),
      tenantStub(),
      sessionsStub(),
      facade,
    );
    await expect(
      ctrl.acceptInvitation({ invitationId: 'inv-1' }, { id: 'u1', email: 'me@acme.com' }),
    ).resolves.toEqual({ tenantId: 't1', roleKey: 'member' });
    expect(facade.acceptInvitation).toHaveBeenCalledWith('inv-1', {
      userId: 'u1',
      email: 'me@acme.com',
    });
  });

  it('rejectInvitation 委派门面（以受邀邮箱锥定）', async () => {
    const facade = selfFacadeStub();
    const ctrl = new OrganizationsSelfController(
      instanceWith({}),
      bindingsStub(),
      tenantStub(),
      sessionsStub(),
      facade,
    );
    await expect(
      ctrl.rejectInvitation({ invitationId: 'inv-1' }, { id: 'u1', email: 'me@acme.com' }),
    ).resolves.toEqual({ ok: true });
    expect(facade.rejectInvitation).toHaveBeenCalledWith('inv-1', 'me@acme.com');
  });

  it('BA status 为字符串的 4xx（如 setActive 非成员 403）同样归一透传', async () => {
    const apiError = Object.assign(new Error('Not a member'), { status: '403' });
    const sessions = sessionsStub();
    const ctrl = new OrganizationsSelfController(
      instanceWith({ setActiveOrganization: vi.fn().mockRejectedValue(apiError) }),
      bindingsStub(),
      tenantStub(),
      sessions,
      selfFacadeStub(),
    );
    await expect(
      ctrl.setActive(
        HEADERS,
        { organizationId: 'org_1' },
        { id: 'u1', email: 'me@acme.com', sessionId: 'sess-1' },
      ),
    ).rejects.toMatchObject({
      status: 403,
    });
    // BA 写失败 → 不得清租位（不产生 org 已切/租已清的半态）。
    expect(sessions.clearActiveTenant).not.toHaveBeenCalled();
  });

  it('P0 X2 双激活位互斥：BA 切活动组织成功后清 activeTenantId（sessionId 取自可信会话）', async () => {
    const setActiveOrganization = vi.fn().mockResolvedValue({ ok: true });
    const clearActiveTenant = vi.fn().mockResolvedValue(1);
    const ctrl = new OrganizationsSelfController(
      instanceWith({ setActiveOrganization }),
      bindingsStub(),
      tenantStub(),
      { clearActiveTenant } as unknown as AuthSessionStore,
      selfFacadeStub(),
    );
    await expect(
      ctrl.setActive(
        HEADERS,
        { organizationId: 'org_1' },
        { id: 'u1', email: 'me@acme.com', sessionId: 'sess-1' },
      ),
    ).resolves.toEqual({ ok: true });
    expect(clearActiveTenant).toHaveBeenCalledWith('sess-1');
  });

  it('P0 X2 互斥：sessionId 缺位（旧会话）→ 跳过清位（中间件读侧 org∈tenant 校验兜底）', async () => {
    const setActiveOrganization = vi.fn().mockResolvedValue({ ok: true });
    const clearActiveTenant = vi.fn().mockResolvedValue(1);
    const ctrl = new OrganizationsSelfController(
      instanceWith({ setActiveOrganization }),
      bindingsStub(),
      tenantStub(),
      { clearActiveTenant } as unknown as AuthSessionStore,
      selfFacadeStub(),
    );
    await ctrl.setActive(HEADERS, { organizationId: 'org_1' }, { id: 'u1', email: 'me@acme.com' });
    expect(clearActiveTenant).not.toHaveBeenCalled();
  });
});

describe('OrganizationsSelfController#odooAvailability（apps 面板数据源·映射切片 D）', () => {
  it('活跃租户 ready 绑定 → available=true + 透传绑定态/公司 id', async () => {
    const row: OrganizationOdooBindingRow = {
      organizationId: 'org-1',
      odooCompanyId: 42,
      odooBindingStatus: 'ready',
      odooCompanyName: 'SAAS-org-1',
      odooBoundAt: new Date(),
    };
    const ctrl = new OrganizationsSelfController(
      instanceWith({}),
      bindingsStub(row),
      tenantStub('org-1'),
      sessionsStub(),
      selfFacadeStub(),
    );
    await expect(ctrl.odooAvailability()).resolves.toEqual({
      available: true,
      odooBindingStatus: 'ready',
      odooCompanyId: 42,
    });
  });

  it('无活跃租户 → available=false 且不触达 reader 端口（面板缺席态可渲染）', async () => {
    const read = vi.fn().mockResolvedValue(null);
    const ctrl = new OrganizationsSelfController(
      instanceWith({}),
      { read } as unknown as OrganizationOdooBindingReader,
      tenantStub(),
      sessionsStub(),
      selfFacadeStub(),
    );
    await expect(ctrl.odooAvailability()).resolves.toEqual({
      available: false,
      odooBindingStatus: null,
      odooCompanyId: null,
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('活跃租户查无绑定 → available=false/null', async () => {
    const ctrl = new OrganizationsSelfController(
      instanceWith({}),
      bindingsStub(null),
      tenantStub('org-1'),
      sessionsStub(),
      selfFacadeStub(),
    );
    await expect(ctrl.odooAvailability()).resolves.toEqual({
      available: false,
      odooBindingStatus: null,
      odooCompanyId: null,
    });
  });

  it('绑定 provisioning（建司中）→ available=false 但透传中间态（面板据此显「开通中」）', async () => {
    const row: OrganizationOdooBindingRow = {
      organizationId: 'org-1',
      odooCompanyId: null,
      odooBindingStatus: 'provisioning',
      odooCompanyName: null,
      odooBoundAt: null,
    };
    const ctrl = new OrganizationsSelfController(
      instanceWith({}),
      bindingsStub(row),
      tenantStub('org-1'),
      sessionsStub(),
      selfFacadeStub(),
    );
    await expect(ctrl.odooAvailability()).resolves.toEqual({
      available: false,
      odooBindingStatus: 'provisioning',
      odooCompanyId: null,
    });
  });
});
