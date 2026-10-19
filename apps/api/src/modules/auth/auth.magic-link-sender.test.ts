import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMagicLinkSender } from './auth.implement';

// magic-link 发信编排锁形（module-auth-magic-link v0.4.0 · 人令「开发环境控制台打印链接」）：
// dev 打链接 + SMTP 失败非致命；生产绝不打链接（一次性 token 泄露面）且发信失败上抛（原语义全等）。

describe('createMagicLinkSender', () => {
  const prevEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...prevEnv };
    vi.restoreAllMocks();
  });

  it('非生产：控制台打印一次性链接并转交 mailer 发信', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    process.env.NODE_ENV = 'development';
    const sendMagicLinkEmail = vi.fn(async () => {});
    await createMagicLinkSender({ sendMagicLinkEmail } as never)({
      email: 'a@b.c',
      url: 'http://x/magic-link/verify?token=t',
    });
    expect(
      log.mock.calls.some((c) => String(c[0]).includes('http://x/magic-link/verify?token=t')),
    ).toBe(true);
    expect(sendMagicLinkEmail).toHaveBeenCalledWith('a@b.c', 'http://x/magic-link/verify?token=t');
  });

  it('非生产：SMTP 未配/发信失败降为 warn，不阻断登录流', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    process.env.NODE_ENV = 'development';
    const sender = createMagicLinkSender({
      sendMagicLinkEmail: async () => {
        throw new Error('no smtp');
      },
    } as never);
    await expect(sender({ email: 'a@b.c', url: 'http://x' })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('生产：不打印链接、不吞错——发信失败原样上抛（语义与原实现全等）', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    process.env.NODE_ENV = 'production';
    const sender = createMagicLinkSender({
      sendMagicLinkEmail: async () => {
        throw new Error('smtp down');
      },
    } as never);
    await expect(sender({ email: 'a@b.c', url: 'http://secret/x' })).rejects.toThrow('smtp down');
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
