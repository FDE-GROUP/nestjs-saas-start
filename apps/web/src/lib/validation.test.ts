import { createInvitationSchema, createPostSchema, createWorkspaceSchema } from '@saas/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { clientValidate, clientValidateFields } from './validation';

// 客户端前置校验基元纯件测：引真 @saas/contracts schema（无网络），锁 i18n key→中文映射与回落。
describe('clientValidate（共享契约客户端前置校验）', () => {
  it('合法输入 → 通过（返 null）', () => {
    expect(clientValidate(createWorkspaceSchema, { name: 'x', slug: 'ok-1' })).toBeNull();
    expect(clientValidate(createPostSchema, { title: 'hi' })).toBeNull();
  });

  it('必填缺失 → 命中 key 给友好中文', () => {
    expect(clientValidate(createWorkspaceSchema, { name: '', slug: 'ok-1' })).toContain(
      '名称不能为空',
    );
    expect(clientValidate(createInvitationSchema, { email: '', role: '' })).toContain(
      '邮箱不能为空',
    );
    expect(clientValidate(createPostSchema, { title: '' })).toContain('标题不能为空');
  });

  it('格式非法（slug 正则）→ 区分必填与格式给对应文案', () => {
    expect(clientValidate(createWorkspaceSchema, { name: 'x', slug: 'Bad Slug!' })).toContain(
      'Slug 格式不正确',
    );
  });

  it('未知 key → 回落原始 message', () => {
    const schema = z.object({ foo: z.string().min(1, 'custom-boom') });
    expect(clientValidate(schema, { foo: '' })).toBe('custom-boom');
  });

  it('多字段同时失败 → 以「；」连接', () => {
    const msg = clientValidate(createInvitationSchema, { email: '', role: '' });
    expect(msg).toContain('；');
    expect(msg).toContain('邮箱不能为空');
    expect(msg).toContain('角色不能为空');
  });
});

// 逐字段版：锁「字段→首条友好中文」映射，供 Field/Select 的 error 形逐字段现形。
describe('clientValidateFields（逐字段错误映射）', () => {
  it('合法输入 → 空映射', () => {
    expect(clientValidateFields(createWorkspaceSchema, { name: 'x', slug: 'ok-1' })).toEqual({});
  });

  it('必填缺失 → 按顶层字段键位给对应文案', () => {
    const out = clientValidateFields(createWorkspaceSchema, { name: '', slug: 'ok-1' });
    expect(out.name).toContain('名称不能为空');
    expect(out.slug).toBeUndefined();
  });

  it('格式非法（slug 正则）→ 命键 slug 且为格式文案（非必填）', () => {
    const out = clientValidateFields(createWorkspaceSchema, { name: 'x', slug: 'Bad Slug!' });
    expect(out.slug).toContain('Slug 格式不正确');
  });

  it('同字段多 issue → 取首条', () => {
    const schema = z.object({ x: z.string().min(1, 'A').regex(/^z$/, 'B') });
    expect(clientValidateFields(schema, { x: '' })).toEqual({ x: 'A' });
  });

  it('email+role 全缺 → 双键并立', () => {
    const out = clientValidateFields(createInvitationSchema, { email: '', role: '' });
    expect(out.email).toContain('邮箱不能为空');
    expect(out.role).toContain('角色不能为空');
  });
});
