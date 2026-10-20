import type { ConfigService } from '@app/config/config.service';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { StorageProvider } from '../providers/storage.interface';
import { StorageService } from './storage.service';

/**
 * 存储门面 provider 选择 + 校验闸单测（module-test-coverage-gaps G2·追溯对拍拓出 storage 面零测）。
 *
 * 锁构造期 provider 选择（命中配置指定者 / 未命中回落 `s3`）与 `validateFile` 两枚领域码
 * （超限→`FILE_TOO_LARGE`·类型非法→`FILE_TYPE_NOT_ALLOWED`）+ `deleteFile`/`getFileUrl` 委派。
 * 全 DB-free：providers 以桩替真 SDK（S3/OSS/COS 不打网络）；校验闸在触 fs 前 throw，无需真临时文件。
 */

function fakeStorageProvider(): StorageProvider {
  return {
    uploadFile: vi.fn(),
    uploadFileFromStream: vi.fn().mockResolvedValue({
      key: 'k',
      url: 'https://u',
      size: 1,
      mimetype: 'image/png',
      originalname: 'a.png',
    }),
    deleteFile: vi.fn().mockResolvedValue(true),
    getFileUrl: vi.fn().mockResolvedValue('https://signed'),
  };
}

function makeService(
  provider: string,
  providers: Record<string, StorageProvider>,
  overrides: Partial<{ maxFileSize: number; allowedMimeTypes: string[] }> = {},
) {
  const config = {
    getStorageConfig: () => ({
      provider,
      maxFileSize: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg'],
      ...overrides,
    }),
  } as unknown as ConfigService;
  return new StorageService(config, providers);
}

describe('StorageService provider 选择（G2）', () => {
  it('命中配置指定 provider → 用之，不触 s3', async () => {
    const s3 = fakeStorageProvider();
    const alioss = fakeStorageProvider();
    const svc = makeService('alioss', { s3, alioss });

    await svc.deleteFile('k');

    expect(alioss.deleteFile).toHaveBeenCalledWith('k');
    expect(s3.deleteFile).not.toHaveBeenCalled();
  });

  it('配置的 provider 未注册 → 回落 s3', async () => {
    const s3 = fakeStorageProvider();
    const svc = makeService('alioss', { s3 }); // alioss 不在注册表

    await svc.deleteFile('k');

    expect(s3.deleteFile).toHaveBeenCalledWith('k');
  });

  it('getFileUrl 委派所选 provider（透传 expiresIn）', async () => {
    const s3 = fakeStorageProvider();
    const svc = makeService('s3', { s3 });

    const url = await svc.getFileUrl('k', 60);

    expect(s3.getFileUrl).toHaveBeenCalledWith('k', 60);
    expect(url).toBe('https://signed');
  });
});

describe('StorageService.validateFile 闸（G2）', () => {
  it('超限 → FILE_TOO_LARGE（触 fs 前 throw）', async () => {
    const svc = makeService('s3', { s3: fakeStorageProvider() }, { maxFileSize: 100 });

    expect.assertions(2);
    try {
      await svc.uploadMultipartFile({
        filename: 'big.png',
        mimetype: 'image/png',
        file: {} as never,
        size: 101,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({
        errorCode: ERROR_CODES.STORAGE_FILE_TOO_LARGE,
      });
    }
  });

  it('类型不在白名单 → FILE_TYPE_NOT_ALLOWED', async () => {
    const svc = makeService('s3', { s3: fakeStorageProvider() });

    expect.assertions(2);
    try {
      await svc.uploadMultipartFile({
        filename: 'x.exe',
        mimetype: 'application/x-msdownload',
        file: {} as never,
        size: 10,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({
        errorCode: ERROR_CODES.STORAGE_FILE_TYPE_NOT_ALLOWED,
      });
    }
  });
});
