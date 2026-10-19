import { createPostSchema } from '@saas/contracts';
import { describe, expect, it } from 'vitest';

/**
 * S8 前后端契约单源闭环证据（global-validation-zod-constitution-amendment §5 L71）。
 *
 * 证明：`@saas/contracts` 的 zod schema 可被**前端**直接消费做运行时表单校验——与后端
 * `@Body({ schema: createPostSchema })` 是同一实例（一份 schema · 两个消费者），换轨的核心收益
 * 「前后端共享一份 schema」自此有真实前端用户（此前仅后端消费）。纯逻辑测，不触 DOM/网络。
 */
describe('前端消费 @saas/contracts createPostSchema（S8 最小闭环）', () => {
  it('合法草稿放行且 transform 生效（与后端同 strict 语义·无未知键即通过）', () => {
    const parsed = createPostSchema.safeParse({ title: 'hello', published: true });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ title: 'hello', published: true });
    }
  });

  it('空标题被拒（与后端同一必填闸·免无效往返）', () => {
    const parsed = createPostSchema.safeParse({ title: '' });
    expect(parsed.success).toBe(false);
  });

  it('缺标题被拒（必填）', () => {
    expect(createPostSchema.safeParse({ content: 'x' }).success).toBe(false);
  });

  it('未知键被 strict 拒（复刻旧 forbidNonWhitelisted）', () => {
    expect(createPostSchema.safeParse({ title: 'ok', sneaky: 1 }).success).toBe(false);
  });
});
