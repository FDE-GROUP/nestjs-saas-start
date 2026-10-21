import type { InjectAuthInstance } from '@app/modules/auth/auth.interface';
import type { RoleAssignabilityReader } from '@app/modules/authorization/domain/ports/role-assignability.port';
import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TenantsOrgAdminController } from './tenants-org-admin.controller';
import { TenantsSelfController } from './tenants-self.controller';

/**
 * 成员/邀请门面单测（module-rbac-casl §2.3.1·甲裁严格拆 · module-rbac-dynamic-roles S3 存在性闸）：
 * 门面对 BA 服务端窄门面的**委派形状**（headers/body/query 透传）与 BA 错误归一
 * （4xx 透传状态·未知/5xx 原样上抛不伪装），以及 S3 新增的**角色可挂载存在性闸**
 * （不可挂载→400 且不触 BA）。@Can 授权裁决由 guard 链锁测覆盖，此处不重复。
 */

function instanceWith(api: Record<string, unknown>): InjectAuthInstance {
  return { get: () => ({ api }) as never, set: () => {} } as unknown as InjectAuthInstance;
}

/** 角色可挂载读端口桩（默认一切角色可挂载，透传至 BA）。领域细化重构 A5：经 published port 相遇。 */
function rbacStub(assignable = true): RoleAssignabilityReader {
  return {
    isRoleAssignable: vi.fn().mockResolvedValue(assignable),
  } as unknown as RoleAssignabilityReader;
}

const HEADERS = { cookie: 'session=abc' };

describe('TenantsOrgAdminController（管理门面·委派 + BA 错误归一）', () => {
  it('listMembers 透传 headers 直调 BA 服务端数据面', async () => {
    const listMembers = vi.fn().mockResolvedValue([{ id: 'm1' }]);
    const ctrl = new TenantsOrgAdminController(instanceWith({ listMembers }), rbacStub());
    await expect(ctrl.listMembers(HEADERS)).resolves.toEqual([{ id: 'm1' }]);
    expect(listMembers).toHaveBeenCalledWith({ headers: HEADERS });
  });

  it('BA 4xx（membership/last-owner 等数据事实拒绝）→ HttpException 透传状态与消息', async () => {
    const apiError = Object.assign(new Error('You are not a member of this organization'), {
      status: 403,
    });
    const ctrl = new TenantsOrgAdminController(
      instanceWith({ removeMember: vi.fn().mockRejectedValue(apiError) }),
      rbacStub(),
    );
    await expect(ctrl.removeMember(HEADERS, { memberId: 'm1' } as never)).rejects.toThrow(
      HttpException,
    );
    await expect(ctrl.removeMember(HEADERS, { memberId: 'm1' } as never)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('5xx/未知错误原样上抛（全局异常过滤器接手·500 面不伪装）', async () => {
    const boom = new Error('db exploded');
    const ctrl = new TenantsOrgAdminController(
      instanceWith({ createInvitation: vi.fn().mockRejectedValue(boom) }),
      rbacStub(),
    );
    await expect(
      ctrl.createInvitation(HEADERS, { email: 'a@b.c', role: 'member' } as never),
    ).rejects.toBe(boom);
  });

  it('auth 实例未就绪 → ForbiddenException(AUTH_PROVIDER_UNAVAILABLE)', async () => {
    const ctrl = new TenantsOrgAdminController({ get: () => undefined } as never, rbacStub());
    // 异步方法内抛错 → 以 rejected Promise 形态呈现（非同步 throw）。
    await expect(ctrl.listMembers(HEADERS)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('S3 存在性闸：不可挂载角色 → BadRequest(400) 且 BA 数据面不被触达', async () => {
    const updateMemberRole = vi.fn();
    const ctrl = new TenantsOrgAdminController(instanceWith({ updateMemberRole }), rbacStub(false));
    await expect(
      ctrl.updateMemberRole(HEADERS, { memberId: 'm1', role: 'ghost' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMemberRole).not.toHaveBeenCalled();
  });
});

describe('TenantsSelfController（个人通道门面·委派形状）', () => {
  it('listMyInvitations 以会话用户 email 收敛服务端查询可见面', async () => {
    const listUserInvitations = vi.fn().mockResolvedValue([]);
    const ctrl = new TenantsSelfController(instanceWith({ listUserInvitations }));
    await ctrl.listMyInvitations(HEADERS, { id: 'u1', email: 'me@acme.com' });
    expect(listUserInvitations).toHaveBeenCalledWith({
      headers: HEADERS,
      query: { email: 'me@acme.com' },
    });
  });

  it('acceptInvitation 透传 body（seats 配额 hook 在 BA 服务端管线照旧生效·不在门面重实现）', async () => {
    const acceptInvitation = vi.fn().mockResolvedValue({ member: { id: 'm1' } });
    const ctrl = new TenantsSelfController(instanceWith({ acceptInvitation }));
    await expect(ctrl.acceptInvitation(HEADERS, { invitationId: 'inv-1' })).resolves.toEqual({
      member: { id: 'm1' },
    });
    expect(acceptInvitation).toHaveBeenCalledWith({
      headers: HEADERS,
      body: { invitationId: 'inv-1' },
    });
  });

  it('BA status 为字符串的 4xx（如 seats 402）同样归一透传', async () => {
    const apiError = Object.assign(new Error('Seat limit reached'), { status: '402' });
    const ctrl = new TenantsSelfController(
      instanceWith({ setActiveOrganization: vi.fn().mockRejectedValue(apiError) }),
    );
    await expect(ctrl.setActive(HEADERS, { organizationId: 'org_1' })).rejects.toMatchObject({
      status: 402,
    });
  });
});
