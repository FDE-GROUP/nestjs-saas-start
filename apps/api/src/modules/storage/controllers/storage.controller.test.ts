import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { BadRequestException, Logger } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageController } from './storage.controller';

/**
 * 存储控制器上传/删除/取址单测（module-test-coverage-gaps G2·controller 侧真实行为）。
 *
 * 锁 `uploadFile` 的真实出口链 + delete/url 委派。**两处关键 as-built 事实**（据实断言·不改码）：
 *  ① `try` 起于取 file 之前（controller L85），`STORAGE_NO_FILE` 抛点在 `try` 内（L89）系**同步 throw**
 *    → 被 catch（L103）吞成 `STORAGE_UPLOAD_FAILED`（HTTP 面不可观测 NO_FILE 具体码·仅存 service 层）；
 *  ② 末行 `return this.storageService.uploadMultipartFile(...)` **未 await**——该 promise 的 reject
 *    发生于 `try` 已同步返回之后，**逃过 catch**，故 service 抛错（含 FILE_TOO_LARGE/TYPE_NOT_ALLOWED/真实错误）
 *    **原样上抛**、保其自身码，不被归一为 UPLOAD_FAILED。
 * 净果：HTTP 面 upload 出口 = `NOT_MULTIPART`（try 前）/`UPLOAD_FAILED`（仅 no-file）/ service 原码（透传）。
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

  it('multipart 但 req.file() 为 null → 被 catch 吞成 STORAGE_UPLOAD_FAILED（NO_FILE 于 HTTP 面不可观测）', async () => {
    const { ctrl } = makeController();
    const req = { isMultipart: () => true, file: async () => null } as unknown as FastifyRequest;

    expect.assertions(2);
    try {
      await ctrl.uploadFile(req);
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({
        errorCode: ERROR_CODES.STORAGE_UPLOAD_FAILED,
      });
      expect((e as BadRequestException).message).toContain('No file uploaded');
    }
  });

  it('service 被拒 → 因末行 `return`（未 await）逃过 catch·原样上抛保自身码（不被归一 UPLOAD_FAILED）', async () => {
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
