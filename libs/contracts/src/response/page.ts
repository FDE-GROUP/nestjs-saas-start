import { z } from 'zod';

/**
 * 响应面 schema 共享基座（S7b·白名单序列化）。
 *
 * ⚠ 与请求面的语义分界（④ 裁定的镜像）：请求 schema 用 `strictObject` **拒**未知键（400）；
 * 响应 schema 用**默认 z.object（静默 strip）**——strip 即白名单本身：未声明字段（含 PII）
 * 被剥落不出线（fail-closed），这是 S7 `@SerializeOptions({schema})` 的新增能力面。
 *
 * Date 字段取 `z.instanceof(Date)`：官方序列化器校验的是**内存对象**（出线前），
 * 输出值保留 Date 实例，经 JSON 序列化仍为 ISO 串——wire 面逐字不变（S6 人审口径）。
 */

/**
 * 偏移分页整体响应（↔ `Page<T>`·整个分页对象裹入信封 data）。
 *
 * @param items - 单条 item 的 zod schema
 * @returns 包裹 items 数组 + total/limit/offset 的响应对象 schema
 * @public
 */
export function offsetPageSchema<T extends z.ZodTypeAny>(items: T) {
  return z.object({
    items: z.array(items),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  });
}

/**
 * 游标分页整体响应（↔ `CursorPage<T>`·`nextCursor` 在 hasMore=false 时缺省）。
 *
 * @param items - 单条 item 的 zod schema
 * @returns 包裹 items 数组 + hasMore/nextCursor 的响应对象 schema
 * @public
 */
export function cursorPageSchema<T extends z.ZodTypeAny>(items: T) {
  return z.object({
    items: z.array(items),
    hasMore: z.boolean(),
    nextCursor: z.string().optional(),
  });
}
