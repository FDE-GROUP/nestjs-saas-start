import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { BadRequestException, Logger } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageController } from './storage.controller';

/**
 * 存储控制器上传/删除/取址单测（module-test-coverage-gaps G2 + module-storage-upload-error-surface 甲档收口）。
 *
 * 锁 `uploadFile` 错误出口链（甲档：末行补 `await` + catch 内 `instanceof HttpException` 原样放行）：
 *  · 非 multipart → `STORAGE_NOT_MULTIPART`（try 前抛·不被吞）；
 *  · multipart 无文件 → `STORAGE_NO_FILE`（try 内同步 throw·catch 见 HttpException 原样放行·HTTP 面可观测）；
 *  · service 抛校验码（`FILE_TOO_LARGE`/`TYPE_NOT_ALLOWED`·经 await 落回 catch）→ HttpException 原样透传；
 *  · service 抛非 HttpException（真未知/流层）→ 兜底归一 `STORAGE_UPLOAD_FAILED`。
 * delete/url 为纯委派。
 */

function makeController() {
  const storageService = {
    uploadMultipartFile: vi.fn().mockResolvedValue({
      key: 'k',
      url: 'https://u',
      size: 1,
      mimetype: 'image/png',
      originalname: 'a.png',
    }),
    deleteFile: vi.fn().mockResolvedValue(true),
    getFileUrl: vi.fn().mockResolvedValue('https://signed'),
  };
  return { ctrl: new StorageController(storageService as never), storageService };
}

describe('StorageController.uploadFile（G2）', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('非 multipart → STORAGE_NOT_MULTIPART（抛于 try 之前·不被吞）', async () => {
    const { ctrl } = makeController();
    const req = { isMultipart: () => false } as unknown as FastifyRequest;

    expect.assertions(2);
    try {
      await ctrl.uploadFile(req);
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({
        errorCode: ERROR_CODES.STORAGE_NOT_MULTIPART,
      });
    }
  });

  it('multipart 但 req.file() 为 null → NO_FILE 原样放行（甲档收口后 HTTP 面可观测）', async () => {
    const { ctrl } = makeController();
    const req = { isMultipart: () => true, file: async () => null } as unknown as FastifyRequest;

    expect.assertions(2);
    try {
      await ctrl.uploadFile(req);
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        errorCode: ERROR_CODES.STORAGE_NO_FILE,
      });
      expect((e as BadRequestException).message).toContain('No file uploaded');
    }
  });

  it('service 抛 HttpException（FILE_TOO_LARGE）→ 经 await 落回 catch·instanceof 判定原样放行保自身码', async () => {
    const { ctrl, storageService } = makeController();
    storageService.uploadMultipartFile.mockRejectedValueOnce(
      new BadRequestException('boom', { errorCode: ERROR_CODES.STORAGE_FILE_TOO_LARGE }),
    );
    const req = {
      isMultipart: () => true,
      file: async () => ({ filename: 'a.png', mimetype: 'image/png', file: { bytesRead: 3 } }),
    } as unknown as FastifyRequest;

    const err = await ctrl.uploadFile(req).catch((e) => e);
    expect((err as BadRequestException).getResponse()).toMatchObject({
      errorCode: ERROR_CODES.STORAGE_FILE_TOO_LARGE,
    });
  });

  it('service 抛非 HttpException（真未知/流层）→ 兜底归一 STORAGE_UPLOAD_FAILED', async () => {
    const { ctrl, storageService } = makeController();
    storageService.uploadMultipartFile.mockRejectedValueOnce(new Error('socket hang up'));
    const req = {
      isMultipart: () => true,
      file: async () => ({ filename: 'a.png', mimetype: 'image/png', file: { bytesRead: 3 } }),
    } as unknown as FastifyRequest;

    const err = await ctrl.uploadFile(req).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({
      errorCode: ERROR_CODES.STORAGE_UPLOAD_FAILED,
    });
  });

  it('正常上传 → 委派 service.uploadMultipartFile（映射 filename/mimetype/file/size）并回其结果', async () => {
    const { ctrl, storageService } = makeController();
    const fileStream = { bytesRead: 7 };
    const req = {
      isMultipart: () => true,
      file: async () => ({ filename: 'a.png', mimetype: 'image/png', file: fileStream }),
    } as unknown as FastifyRequest;

    const out = await ctrl.uploadFile(req);

    expect(storageService.uploadMultipartFile).toHaveBeenCalledWith({
      filename: 'a.png',
      mimetype: 'image/png',
      file: fileStream,
      size: 7,
    });
    expect(out).toMatchObject({ key: 'k', url: 'https://u' });
  });
});

describe('StorageController.deleteFile / getFileUrl（G2）', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('deleteFile → { success }', async () => {
    const { ctrl, storageService } = makeController();
    const out = await ctrl.deleteFile('k');
    expect(storageService.deleteFile).toHaveBeenCalledWith('k');
    expect(out).toEqual({ success: true });
  });

  it('getFileUrl → { url }（透传 expiresIn）', async () => {
    const { ctrl, storageService } = makeController();
    const out = await ctrl.getFileUrl('k', 60);
    expect(storageService.getFileUrl).toHaveBeenCalledWith('k', 60);
    expect(out).toEqual({ url: 'https://signed' });
  });
});
