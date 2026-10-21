import { describe, expect, it } from 'vitest';
import { evaluateUpload } from './upload-policy';

/**
 * 上传校验策略纯单测（分层对齐·domain 零框架依赖）。
 * 锁 `evaluateUpload` 的裁决语义与判定顺序（先尺寸、后类型），对齐迁移前 `validateFile` 行为。
 */
const constraint = { maxFileSize: 100, allowedMimeTypes: ['image/png', 'image/jpeg'] };

describe('evaluateUpload（domain 策略）', () => {
  it('尺寸与类型均合规 → ok', () => {
    expect(evaluateUpload({ size: 50, mimetype: 'image/png' }, constraint)).toEqual({ ok: true });
  });

  it('尺寸恰等于上限 → 放行（严格大于才拒）', () => {
    expect(evaluateUpload({ size: 100, mimetype: 'image/png' }, constraint).ok).toBe(true);
  });

  it('超限 → too-large', () => {
    expect(evaluateUpload({ size: 101, mimetype: 'image/png' }, constraint)).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('类型不在白名单 → type-not-allowed', () => {
    expect(evaluateUpload({ size: 50, mimetype: 'application/x-msdownload' }, constraint)).toEqual({
      ok: false,
      reason: 'type-not-allowed',
    });
  });

  it('两者皆违规 → 先报 too-large（判定顺序）', () => {
    expect(evaluateUpload({ size: 999, mimetype: 'application/x-msdownload' }, constraint)).toEqual(
      { ok: false, reason: 'too-large' },
    );
  });
});
