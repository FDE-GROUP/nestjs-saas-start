import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { strictObject } from './index';

describe('@saas/contracts · strictObject（④ 默认严格 helper）', () => {
  it('接受已声明字段', () => {
    const schema = strictObject({ name: z.string() });
    expect(schema.parse({ name: 'x' })).toEqual({ name: 'x' });
  });

  it('strictObject 拒未知字段（复刻 forbidNonWhitelisted）', () => {
    const schema = strictObject({ name: z.string() });
    expect(() => schema.parse({ name: 'x', extra: 1 })).toThrow();
  });

  it('zod v4 默认对象静默 strip 未知（非报错）——故必须显式 strictObject 才等价 forbid', () => {
    const loose = z.object({ name: z.string() });
    // 普通 z.object：未知键被静默剥离，不抛错
    expect(loose.parse({ name: 'x', extra: 1 })).toEqual({ name: 'x' });
  });

  it('外层 strict 不向下继承——嵌套对象须各自 strictObject 才拒未知', () => {
    // 嵌套非 strict：未知被静默 strip，外层不报错
    const schema = strictObject({ flag: z.object({ ok: z.boolean() }) });
    expect(schema.parse({ flag: { ok: true, sneaky: 1 } })).toEqual({ flag: { ok: true } });
    // 嵌套也用 strictObject：未知被拒
    const schemaDeep = strictObject({ flag: strictObject({ ok: z.boolean() }) });
    expect(() => schemaDeep.parse({ flag: { ok: true, sneaky: 1 } })).toThrow();
  });

  it('实现 StandardSchemaV1（~standard 存在·供官方件消费）', () => {
    const schema = strictObject({ name: z.string() });
    expect('~standard' in schema).toBe(true);
  });
});
