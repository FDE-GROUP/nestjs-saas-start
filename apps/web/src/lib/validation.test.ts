import { createInvitationSchema, createPostSchema, createWorkspaceSchema } from '@saas/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { clientValidate } from './validation';

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
