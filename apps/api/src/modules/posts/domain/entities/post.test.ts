import { describe, expect, it } from 'vitest';
import { Post } from './post';

/**
 * 领域实体纯测（module-posts-fc-projection-doctrine · FC 口径）：锁工厂不变量口径（对齐 `createPostSchema`·
 * 只防御不收紧）、两阶段构造（draft 未落库态 vs restore 完整态）、生命周期经**纯转移**（返回新实例·不可变）。零框架依赖、纯函数断言。
 */
const baseState = {
  id: 'p1',
  title: 'T',
  content: null,
  published: false,
  organizationId: 'orgA',
  workspaceId: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Post · 不可变领域实体（FC）', () => {
  it('draft() 强制 title 非空不变量（对齐 createPostSchema.title=reqString·z.string().min(1)）', () => {
    expect(() => Post.draft({ title: '' })).toThrow();
    expect(() => Post.draft({ title: 'x' })).not.toThrow();
  });

  it('draft() 新建态：业务字段就位·id/租户/时间戳未落库为 null·content 归一 null·缺省未发布', () => {
    const post = Post.draft({ title: 'hello' });
    expect(post.title).toBe('hello');
    expect(post.content).toBeNull();
    expect(post.published).toBe(false);
    expect(post.id).toBeNull();
    expect(post.organizationId).toBeNull();
    expect(post.createdAt).toBeNull();
  });

  it('draft() 保留 content 值（含空串·与 zod 口径一致不额外收紧）', () => {
    expect(Post.draft({ title: 't', content: '' }).content).toBe('');
    expect(Post.draft({ title: 't', content: 'body' }).content).toBe('body');
  });

  it('withPublished()/withUnpublished() 纯转移返回新实例·原实例不变（幂等）', () => {
    const draft = Post.draft({ title: 't' });
    const published = draft.withPublished();
    expect(published.published).toBe(true);
    expect(draft.published).toBe(false); // 原实例不受影响（不可变）
    expect(published.title).toBe('t'); // 纯转移保留其余业务字段
    expect(published.withPublished()).toBe(published); // 幂等·已发布返回 this
    const unpublished = published.withUnpublished();
    expect(unpublished.published).toBe(false);
    expect(published.published).toBe(true); // 原实例仍为已发布
    expect(unpublished.withUnpublished()).toBe(unpublished); // 幂等
  });

  it('restore() 复原完整持久实例（不重复业务校验·信任仓储读出的行）', () => {
    const post = Post.restore(baseState);
    expect(post.id).toBe('p1');
    expect(post.organizationId).toBe('orgA');
    expect(post.createdAt).toEqual(baseState.createdAt);
    expect(post.published).toBe(false);
    // 复原不校验：既存 title 为空的行亦可复原（校验只在创建时裁决）
    expect(Post.restore({ ...baseState, title: '' }).title).toBe('');
  });
});
