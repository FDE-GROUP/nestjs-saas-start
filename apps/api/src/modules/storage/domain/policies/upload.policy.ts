/**
 * 上传校验策略纯函数（真实领域规则·result-union）。
 *
 * @remarks
 * 从 `StorageService.validateFile` 提取：尺寸超限 / MIME 不在白名单。
 * 领域层不抛框架异常、不引用 HTTP 语义——只返回裁决；由 `application`
 * 层映射为对应的 `BadRequestException` + 错误码（保持既有 HTTP 行为不变）。
 * 判定顺序沿用原实现：先尺寸、后类型。
 * @public
 */
export interface UploadConstraint {
  maxFileSize: number;
  allowedMimeTypes: string[];
}

/**
 * 待校验的上传候选文件形状（仅裁决所需字段）。
 * @public
 */
export interface UploadCandidate {
  size: number;
  mimetype: string;
}

/**
 * 上传拒因词汇：`too-large` = 尺寸超限；`type-not-allowed` = MIME 不在白名单。
 * @public
 */
export type UploadRejection = 'too-large' | 'type-not-allowed';

/**
 * 上传裁决结果（result-union：通过 / 携拒因）。
 * @public
 */
export type UploadVerdict = { ok: true } | { ok: false; reason: UploadRejection };

/**
 * 对上传候选文件过闸（先尺寸、后类型）。
 * @param file - 待校验的上传候选。
 * @param constraint - 尺寸上限 + MIME 白名单。
 * @returns 裁决结果（通过或携拒因）。
 * @public
 */
export function evaluateUpload(file: UploadCandidate, constraint: UploadConstraint): UploadVerdict {
  if (file.size > constraint.maxFileSize) {
    return { ok: false, reason: 'too-large' };
  }
  if (!constraint.allowedMimeTypes.includes(file.mimetype)) {
    return { ok: false, reason: 'type-not-allowed' };
  }
  return { ok: true };
}
