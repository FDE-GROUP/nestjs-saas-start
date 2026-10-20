import { describe, expect, it } from 'vitest';
import {
  type CursorKey,
  createCursorPage,
  createPage,
  decodeCursor,
  encodeCursor,
  type Page,
  type PageRequest,
} from './pagination';

/** 分页契约单测（module-common-pagination-contract·丙裁：唯一构造点的形状纪律）。 */
describe('Page<T> 契约（shared-kernel）', () => {
  it('createPage 产出四字段全形（items/total/limit/offset·回显请求）', () => {
    const request: PageRequest = { limit: 20, offset: 40 };
    const page: Page<string> = createPage(['a', 'b'], 7, request);
    expect(page).toEqual({ items: ['a', 'b'], total: 7, limit: 20, offset: 40 });
  });

  it('items 为浅复制：源数组事后 mutation 不泄漏进已构造的 page', () => {
    const source = [{ id: 1 }];
    const page = createPage(source, 1, { limit: 10, offset: 0 });
    source.push({ id: 2 });
    expect(page.items).toHaveLength(1);
  });

  it('空结果集仍为合法页（total 独立于 items 长度）', () => {
    expect(createPage([], 0, { limit: 20, offset: 100 })).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 100,
    });
  });
});

/** 游标分页契约单测（就绪预备切片 B·#3 甲档收口后为 `id` 单键·浅复制纪律 + 编解码往返）。 */
describe('CursorPage<T> 契约（shared-kernel）', () => {
  it('createCursorPage 全形（items/hasMore/nextCursor）', () => {
    const page = createCursorPage(['a', 'b'], true, 'cur-1');
    expect(page).toEqual({ items: ['a', 'b'], hasMore: true, nextCursor: 'cur-1' });
  });

  it('hasMore=false 且不传 nextCursor 时响应形不含 nextCursor 键', () => {
    const page = createCursorPage([], false);
    expect(page).toEqual({ items: [], hasMore: false });
    expect('nextCursor' in page).toBe(false);
  });

  it('items 浅复制：源数组事后 mutation 不泄漏', () => {
    const source = [{ id: 1 }];
    const page = createCursorPage(source, true, 'x');
    source.push({ id: 2 });
    expect(page.items).toHaveLength(1);
  });
});

describe('游标编解码（opaque base64url·id 单键）', () => {
  it('encode→decode 往返保持 id 单键', () => {
    const key: CursorKey = { id: 'uuid-abc' };
    const cursor = encodeCursor(key);
    // 不透明：仅为 base64url 字符集
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual(key);
  });

  it('非 base64url 可解码乱码 → 抛错', () => {
    expect(() => decodeCursor('%%%not-base64%%%')).toThrow(/Invalid cursor/);
  });

  it('合法 base64url 但载荷非数组（对象）→ 抛错', () => {
    const bogus = Buffer.from(JSON.stringify({ nope: 1 })).toString('base64url');
    expect(() => decodeCursor(bogus)).toThrow(/Invalid cursor/);
  });

  it('数组长度非 1（旧 [date,id] 形也归非法）→ 抛错', () => {
    const bogus = Buffer.from(JSON.stringify(['2026-01-01T00:00:00.000Z', 'id1'])).toString(
      'base64url',
    );
    expect(() => decodeCursor(bogus)).toThrow(/expected \[id\]/);
  });

  it('单元素为空串/非字符串 → 抛错', () => {
    const bogus = Buffer.from(JSON.stringify([''])).toString('base64url');
    expect(() => decodeCursor(bogus)).toThrow(/malformed segment/);
  });
});
