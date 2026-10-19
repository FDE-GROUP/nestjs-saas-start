import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  createCheckoutSchema,
  createCustomerSchema,
  createInvitationSchema,
  createPostSchema,
  createRoleSchema,
  createSubscriptionSchema,
  createTenantApplicationSchema,
  createWorkspaceSchema,
  grantRolePermissionSchema,
  invitationIdSchema,
  leaveTenantSchema,
  listCursorQuerySchema,
  listPageQuerySchema,
  listPlatformTenantsQuerySchema,
  refundPaymentSchema,
  removeMemberSchema,
  renameRoleSchema,
  setActiveTenantSchema,
  suspendUserSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
} from './index';

/** 取 standard-schema 校验后的 issue 三元组（path/message/code），无 issue 返回空数组。 */
function issuesOf(
  schema: z.ZodTypeAny,
  input: unknown,
): { path: string; message: string; code: string }[] {
  const r = schema['~standard'].validate(input) as {
    issues?: { path?: unknown[]; message: string; code: string }[];
  };
  if (!r.issues) return [];
  return r.issues.map((i) => ({
    path: (i.path ?? [])
      .map((s) =>
        String(typeof s === 'object' && s !== null && 'key' in s ? (s as { key: unknown }).key : s),
      )
      .join('.'),
    message: i.message,
    code: i.code,
  }));
}

/** 断言某字段命中预期 i18n key（存在一条 path+message 完全匹配的 issue）。 */
function expectIssueKey(schema: z.ZodTypeAny, input: unknown, path: string, key: string) {
  const hit = issuesOf(schema, input).some((i) => i.path === path && i.message === key);
  expect(
    hit,
    `expected issue {path:${path}, message:${key}} in ${JSON.stringify(issuesOf(schema, input))}`,
  ).toBe(true);
}

/** 断言存在某 path 的 issue（消息为 zod 默认英文·复刻旧无 message 的 DTO 字段）。 */
function expectIssueAt(schema: z.ZodTypeAny, input: unknown, path: string) {
  expect(issuesOf(schema, input).some((i) => i.path === path)).toBe(true);
}

/** 断言无 issue（通过）并回传解析值。 */
function parseOk(schema: z.ZodTypeAny, input: unknown): unknown {
  const r = issuesOf(schema, input);
  expect(r, `expected no issues but got ${JSON.stringify(r)}`).toEqual([]);
  const out = schema['~standard'].validate(input) as { value?: unknown };
  return out.value;
}

describe('@saas/contracts · 请求契约换轨 parity（复刻旧 class-validator DTO 语义）', () => {
  it('listPageQuerySchema：默认 limit=20/offset=0·数字串隐转·越界拒·未知键拒', () => {
    expect(parseOk(listPageQuerySchema, {})).toEqual({ limit: 20, offset: 0 });
    expect(parseOk(listPageQuerySchema, { limit: '5', offset: '10' })).toEqual({
      limit: 5,
      offset: 10,
    });
    expectIssueAt(listPageQuerySchema, { limit: '0' }, 'limit');
    expectIssueAt(listPageQuerySchema, { limit: '101' }, 'limit');
    expectIssueAt(listPageQuerySchema, { bogus: 1 }, '');
  });

  it('listCursorQuerySchema：空串 cursor 归首页·合法透传·畸形回 key·未知键拒', () => {
    expect(parseOk(listCursorQuerySchema, { cursor: '' })).toEqual({ limit: 20 });
    expect(parseOk(listCursorQuerySchema, { cursor: 'abcDEF_-' })).toEqual({
      limit: 20,
      cursor: 'abcDEF_-',
    });
    expectIssueKey(listCursorQuerySchema, { cursor: '@@bad' }, 'cursor', 'validate.cursor.invalid');
    expectIssueAt(listCursorQuerySchema, { nope: 1 }, '');
  });

  it('createPostSchema：title 必填回 key·可选字段放行·published 须布尔·未知键拒', () => {
    expect(parseOk(createPostSchema, { title: 'Hi' })).toEqual({ title: 'Hi' });
    expect(parseOk(createPostSchema, { title: 'Hi', content: 'x', published: true })).toEqual({
      title: 'Hi',
      content: 'x',
      published: true,
    });
    expectIssueKey(createPostSchema, { title: '' }, 'title', 'validate.title.required');
    expectIssueKey(createPostSchema, {}, 'title', 'validate.title.required');
    expectIssueAt(createPostSchema, { title: 'x', published: 'true' }, 'published');
    expectIssueAt(createPostSchema, { title: 'x', extra: 1 }, '');
  });

  it('createWorkspaceSchema / createTenantApplicationSchema：name/slug 必填 + slug 形态回 key', () => {
    for (const schema of [createWorkspaceSchema, createTenantApplicationSchema]) {
      expect(parseOk(schema, { name: 'Acme', slug: 'acme-1' })).toEqual({
        name: 'Acme',
        slug: 'acme-1',
      });
      expectIssueKey(schema, { name: '', slug: 'ok' }, 'name', 'validate.name.required');
      expectIssueKey(schema, { name: 'x', slug: '' }, 'slug', 'validate.slug.required');
      expectIssueKey(schema, { name: 'x', slug: 'BAD!' }, 'slug', 'validate.slug.invalid');
    }
  });

  it('updateWorkspaceSchema：全可选·空对象放行·present 才校验', () => {
    expect(parseOk(updateWorkspaceSchema, {})).toEqual({});
    expect(parseOk(updateWorkspaceSchema, { name: 'x' })).toEqual({ name: 'x' });
    expectIssueKey(updateWorkspaceSchema, { name: '' }, 'name', 'validate.name.required');
    expectIssueKey(updateWorkspaceSchema, { slug: 'X!' }, 'slug', 'validate.slug.invalid');
  });

  it('租户门面六类：各字段回对应 required key（email 仅非空·不校验格式）', () => {
    expectIssueKey(
      updateMemberRoleSchema,
      { role: 'admin' },
      'memberId',
      'validate.memberId.required',
    );
    expectIssueKey(updateMemberRoleSchema, { memberId: 'm' }, 'role', 'validate.role.required');
    expect(parseOk(updateMemberRoleSchema, { memberId: 'm', role: 'custom-role' })).toEqual({
      memberId: 'm',
      role: 'custom-role',
    });
    expectIssueKey(removeMemberSchema, {}, 'memberId', 'validate.memberId.required');
    expectIssueKey(leaveTenantSchema, {}, 'organizationId', 'validate.organizationId.required');
    // createInvitation.email：旧 @IsString+@IsNotEmpty（非 @IsEmail）——非邮箱串仍放行，只挡空
    expect(parseOk(createInvitationSchema, { email: 'not-an-email', role: 'member' })).toEqual({
      email: 'not-an-email',
      role: 'member',
    });
    expectIssueKey(
      createInvitationSchema,
      { email: '', role: 'member' },
      'email',
      'validate.email.required',
    );
    expectIssueKey(invitationIdSchema, {}, 'invitationId', 'validate.invitationId.required');
    expectIssueKey(setActiveTenantSchema, {}, 'organizationId', 'validate.organizationId.required');
  });

  it('createRole/renameRole：roleKey/roleName 必填回 key', () => {
    for (const schema of [createRoleSchema, renameRoleSchema]) {
      expect(parseOk(schema, { key: 'editor', name: 'Editor' })).toEqual({
        key: 'editor',
        name: 'Editor',
      });
      expectIssueKey(schema, { key: '', name: 'n' }, 'key', 'validate.roleKey.required');
      expectIssueKey(schema, { key: 'k', name: '' }, 'name', 'validate.roleName.required');
    }
  });

  it('grantRolePermissionSchema：subject/action 枚举·conditions 非对象回 key·未知键拒', () => {
    expect(
      parseOk(grantRolePermissionSchema, { roleKey: 'r', subject: 'Workspace', action: 'read' }),
    ).toEqual({ roleKey: 'r', subject: 'Workspace', action: 'read' });
    expect(
      parseOk(grantRolePermissionSchema, {
        roleKey: 'r',
        subject: 'Organization',
        action: 'create',
        conditions: { ownerId: '{{userId}}' },
      }),
    ).toMatchObject({ conditions: { ownerId: '{{userId}}' } });
    expectIssueAt(
      grantRolePermissionSchema,
      { roleKey: 'r', subject: 'Nope', action: 'read' },
      'subject',
    );
    expectIssueAt(
      grantRolePermissionSchema,
      { roleKey: 'r', subject: 'Role', action: 'fly' },
      'action',
    );
    expectIssueKey(
      grantRolePermissionSchema,
      { roleKey: 'r', subject: 'Role', action: 'read', conditions: 'str' },
      'conditions',
      'validate.grantConditions.object',
    );
    expectIssueAt(
      grantRolePermissionSchema,
      { roleKey: 'r', subject: 'Role', action: 'read', zzz: 1 },
      '',
    );
  });

  it('createCheckoutSchema：amount 数字隐转 + 下限·currency 必填·metadata 对象·未知键拒', () => {
    expect(parseOk(createCheckoutSchema, { amount: '2000', currency: 'usd' })).toEqual({
      amount: 2000,
      currency: 'usd',
    });
    expectIssueAt(createCheckoutSchema, { amount: 0, currency: 'usd' }, 'amount');
    expectIssueAt(createCheckoutSchema, { amount: 100, currency: '' }, 'currency');
    expect(
      parseOk(createCheckoutSchema, { amount: 100, currency: 'usd', metadata: { a: 'b' } }),
    ).toMatchObject({ metadata: { a: 'b' } });
    expectIssueAt(createCheckoutSchema, { amount: 100, currency: 'usd', extra: 1 }, '');
  });

  it('createCustomerSchema：email 校验格式（旧 @IsEmail）·可选字段放行', () => {
    expect(parseOk(createCustomerSchema, { email: 'a@b.com' })).toEqual({ email: 'a@b.com' });
    expectIssueAt(createCustomerSchema, { email: 'not-an-email' }, 'email');
  });

  it('refundPaymentSchema：checkoutId 必填·amount 可选数字隐转 + 下限', () => {
    expect(parseOk(refundPaymentSchema, { checkoutId: 'pi_1' })).toEqual({ checkoutId: 'pi_1' });
    expect(parseOk(refundPaymentSchema, { checkoutId: 'pi_1', amount: '500' })).toEqual({
      checkoutId: 'pi_1',
      amount: 500,
    });
    expectIssueAt(refundPaymentSchema, { checkoutId: '' }, 'checkoutId');
    expectIssueAt(refundPaymentSchema, { checkoutId: 'pi_1', amount: 0 }, 'amount');
  });

  it('listPlatformTenantsQuerySchema：继承分页 + search 可选', () => {
    expect(parseOk(listPlatformTenantsQuerySchema, { search: 'ac' })).toEqual({
      limit: 20,
      offset: 0,
      search: 'ac',
    });
    expectIssueAt(listPlatformTenantsQuerySchema, { bogus: 1 }, '');
  });

  it('suspendUserSchema：reason 可选·超 500 拒·空对象放行', () => {
    expect(parseOk(suspendUserSchema, {})).toEqual({});
    expect(parseOk(suspendUserSchema, { reason: 'abuse' })).toEqual({ reason: 'abuse' });
    expectIssueAt(suspendUserSchema, { reason: 'x'.repeat(501) }, 'reason');
  });

  it('createSubscriptionSchema：plan 枚举·customerEmail 格式·quota 数字隐转', () => {
    expect(parseOk(createSubscriptionSchema, { plan: 'pro', customerEmail: 'a@b.com' })).toEqual({
      plan: 'pro',
      customerEmail: 'a@b.com',
    });
    expectIssueAt(createSubscriptionSchema, { plan: 'gold', customerEmail: 'a@b.com' }, 'plan');
    expectIssueAt(
      createSubscriptionSchema,
      { plan: 'free', customerEmail: 'bad' },
      'customerEmail',
    );
    expect(
      parseOk(createSubscriptionSchema, {
        plan: 'pro',
        customerEmail: 'a@b.com',
        seatsLimit: '10',
      }),
    ).toEqual({
      plan: 'pro',
      customerEmail: 'a@b.com',
      seatsLimit: 10,
    });
  });
});
