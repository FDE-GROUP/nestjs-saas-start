import { describe, expect, it } from 'vitest';
import { currentRequestId, requestStorage } from './request-context';

/** 请求上下文单测（module-common-request-correlation）：store 内外两态 + 跨 await 层级穿透。 */
describe('request-context（shared-kernel ALS）', () => {
  it('store 之外读取返回 undefined（后台任务/脚本/测试语义）', () => {
    expect(currentRequestId()).toBeUndefined();
  });

  it('run 包裹内可读，且跨 await 层级仍在同请求链上', async () => {
    await requestStorage.run({ requestId: 'rq-1' }, async () => {
      expect(currentRequestId()).toBe('rq-1');
      await Promise.resolve();
      expect(currentRequestId()).toBe('rq-1');
    });
    // 出链即复位，不泄漏到后续调用。
    expect(currentRequestId()).toBeUndefined();
  });

  it('嵌套 run 以内层为准（不与 tenantIsolationStorage 等其它上下文互串）', async () => {
    await requestStorage.run({ requestId: 'outer' }, () =>
      requestStorage.run({ requestId: 'inner' }, () => {
        expect(currentRequestId()).toBe('inner');
      }),
    );
  });
});
