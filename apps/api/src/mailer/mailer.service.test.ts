import * as path from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { I18nModule, I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MailerService } from './mailer.service';

// Fake I18nService echoing a deterministic string per key+lang so we can assert
// the localization wiring (subject + body keys driven by `lang`, args interpolation).
const makeI18n = () => {
  const translate = vi.fn(
    (key: string, opts: { lang: string; args?: Record<string, unknown> } = { lang: 'zh' }) =>
      `T[${key}|${opts.lang}]`,
  );
  return { translate } as unknown as I18nService & { translate: ReturnType<typeof vi.fn> };
};

const configStub = {
  get: (k: string) =>
    (
      ({ MAIL_HOST: 'localhost', MAIL_PORT: 1025, APP_URL: 'http://localhost:3000' }) as Record<
        string,
        unknown
      >
    )[k],
} as unknown as ConfigService;

describe('MailerService (i18n localization)', () => {
  let i18n: ReturnType<typeof makeI18n>;
  let sendMail: ReturnType<typeof vi.fn>;
  let service: MailerService;

  beforeEach(() => {
    i18n = makeI18n();
    sendMail = vi.fn().mockResolvedValue({ messageId: 'x' });
    service = new MailerService(configStub, i18n);
    // Replace the nodemailer transporter with a spy (no network in CI).
    (service as unknown as { transporter: { sendMail: typeof sendMail } }).transporter = {
      sendMail,
    };
  });

  it('sendWelcomeEmail localizes subject + body via I18nService with lang', async () => {
    await service.sendWelcomeEmail('a@b.com', 'Ann', 'zh');

    expect(i18n.translate).toHaveBeenCalledWith('emails.welcome.subject', { lang: 'zh' });
    // Body localization: greeting/message keys are pulled through I18nService with lang.
    expect(i18n.translate).toHaveBeenCalledWith(
      'emails.welcome.greeting',
      expect.objectContaining({ lang: 'zh' }),
    );
    expect(i18n.translate).toHaveBeenCalledWith(
      'emails.welcome.message',
      expect.objectContaining({ lang: 'zh' }),
    );
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('a@b.com');
    expect(mail.subject).toBe('T[emails.welcome.subject|zh]');
  });

  it('sendVerificationEmail passes interpolation args and honors en lang', async () => {
    await service.sendVerificationEmail('a@b.com', '123456', 'en');

    expect(i18n.translate).toHaveBeenCalledWith('emails.verification.subject', { lang: 'en' });
    // message key requested with the verificationCode context available for interpolation
    const messageCall = i18n.translate.mock.calls.find(
      (c) => c[0] === 'emails.verification.message',
    );
    expect(messageCall?.[1]?.args).toMatchObject({ verificationCode: '123456' });
    expect(sendMail.mock.calls[0][0].subject).toBe('T[emails.verification.subject|en]');
  });

  it('sendForgotPasswordEmail localizes subject', async () => {
    await service.sendForgotPasswordEmail('a@b.com', 'tok', 30, 'ja');
    expect(i18n.translate).toHaveBeenCalledWith('emails.forgot-password.subject', { lang: 'ja' });
    expect(sendMail.mock.calls[0][0].subject).toBe('T[emails.forgot-password.subject|ja]');
  });

  it('sendMagicLinkEmail localizes subject + carries magicLinkUrl context', async () => {
    await service.sendMagicLinkEmail('a@b.com', 'http://x/magic-link/verify?token=t', 'en');
    expect(i18n.translate).toHaveBeenCalledWith('emails.magic-link.subject', { lang: 'en' });
    // Body localization pulls the magic-link message key through I18nService with lang,
    // and the sign-in URL handed down by Better Auth flows into the interpolation args.
    const messageCall = i18n.translate.mock.calls.find((c) => c[0] === 'emails.magic-link.message');
    expect(messageCall?.[1]?.args).toMatchObject({
      magicLinkUrl: 'http://x/magic-link/verify?token=t',
    });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe('a@b.com');
    expect(mail.subject).toBe('T[emails.magic-link.subject|en]');
  });

  it('loads real zh/en translations from src/i18n through the wired I18nModule', async () => {
    // Guards the loader path (__dirname/../i18n) + real JSON assets against regressions.
    const moduleRef = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          fallbackLanguage: 'zh',
          loaderOptions: { path: path.join(__dirname, '..', 'i18n'), watch: false },
          resolvers: [],
        }),
      ],
    }).compile();
    // No generated i18n type map exists, so I18nService.translate's `Path<K>` narrows
    // to `never`. Loosen the key type just for this assertion helper.
    const svc = moduleRef.get(I18nService) as unknown as {
      translate: (key: string, opts?: { lang?: string; args?: Record<string, unknown> }) => string;
    };
    expect(svc.translate('validate.email.required', { lang: 'zh' })).toBe('请输入邮箱');
    expect(svc.translate('emails.verification.title', { lang: 'zh' })).toBe('邮箱验证');
    expect(svc.translate('emails.verification.subject', { lang: 'en' })).toBe(
      'Verify Your Email Address',
    );
    // Interpolation is driven by single-brace args (matches emails.json `{verificationCode}`).
    expect(
      svc.translate('emails.verification.message', {
        lang: 'zh',
        args: { verificationCode: '999' },
      }),
    ).toContain('999');
    await moduleRef.close();
  });
});
