/**
 * 上传校验策略（真实领域规则·纯函数·result-union）。
 *
 * 从 `StorageService.validateFile` 提取：尺寸超限 / MIME 不在白名单。
 * 领域层不抛框架异常、不引用 HTTP 语义——只返回裁决；由 `application`
 * 层映射为对应的 `BadRequestException` + 错误码（保持既有 HTTP 行为不变）。
 * 判定顺序沿用原实现：先尺寸、后类型。
 */
export interface UploadConstraint {
  maxFileSize: number;
  allowedMimeTypes: string[];
}

export interface UploadCandidate {
  size: number;
  mimetype: string;
}

export type UploadRejection = 'too-large' | 'type-not-allowed';

export type UploadVerdict = { ok: true } | { ok: false; reason: UploadRejection };

export function evaluateUpload(file: UploadCandidate, constraint: UploadConstraint): UploadVerdict {
  if (file.size > constraint.maxFileSize) {
    return { ok: false, reason: 'too-large' };
  }
  if (!constraint.allowedMimeTypes.includes(file.mimetype)) {
    return { ok: false, reason: 'type-not-allowed' };
  }
  return { ok: true };
}
