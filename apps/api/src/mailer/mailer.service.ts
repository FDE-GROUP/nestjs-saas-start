import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import mjml from 'mjml';
import { I18nService } from 'nestjs-i18n';
import * as nodemailer from 'nodemailer';
import * as path from 'path';
import { resolveEmailsDir } from '../i18n/assets-root';

// 邮件 MJML 模板目录经 i18n 资产根单点解析（与 loader 同源）；旧写法
// `dirname(import.meta.url)/../i18n/emails` 在产物布局下指向不存在目录→ readFile ENOENT。
const emailsDir = resolveEmailsDir();

// Body translation keys per email template (matches src/i18n/<lang>/emails.json structure).
const EMAIL_BODY_KEYS = ['title', 'greeting', 'message', 'button', 'footer'] as const;

@Injectable()
export class MailerService {
  private readonly transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailerService.name);

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(I18nService) private readonly i18n: I18nService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('MAIL_HOST'),
      port: this.configService.get('MAIL_PORT'),
      secure: this.configService.get('MAIL_SECURE') === 'true',
      auth: {
        user: this.configService.get('MAIL_USER'),
        pass: this.configService.get('MAIL_PASSWORD'),
      },
    });
  }

  // 默认入口语言置中文（依 global-cn-adaptation L1 / vision §6 地域约束）。
  // I18nService 由全局 AppI18nModule 提供，正文/主题按 lang 从资产根下 <lang>/emails.json 取。
  private async renderTemplate(
    templateName: string,
    context: Record<string, any>,
    lang: string = 'zh',
  ): Promise<string> {
    try {
      // Read MJML template
      const templatePath = path.join(emailsDir, `${templateName}.mjml`);
      let mjmlTemplate = await fs.readFile(templatePath, 'utf8');

      // Replace template variables with translations
      const translations = await this.getEmailTranslations(templateName, lang, context);

      // Replace all the translation placeholders in the template
      Object.entries(translations).forEach(([key, value]) => {
        const regex = new RegExp(
          `{\\{\\s*'emails\\.${templateName}\\.${key}'\\s*\\|\\s*translate(?::\\s*\\{.*?\\})?\\s*\\}\\}`,
          'g',
        );
        mjmlTemplate = mjmlTemplate.replace(regex, value);
      });

      // Replace context variables
      Object.entries(context).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
        mjmlTemplate = mjmlTemplate.replace(regex, String(value));
      });

      // Convert MJML to HTML
      const { html } = mjml(mjmlTemplate);
      return html;
    } catch (error) {
      this.logger.error(`Failed to render template ${templateName}`, error);
      throw error;
    }
  }

  private getEmailTranslations(
    templateName: string,
    lang: string,
    context: Record<string, any>,
  ): Record<string, string> {
    const translations: Record<string, string> = {};
    for (const key of EMAIL_BODY_KEYS) {
      translations[key] = this.i18n.translate(`emails.${templateName}.${key}`, {
        lang,
        args: context,
      });
    }
    return translations;
  }

  private getEmailSubject(templateName: string, lang: string): string {
    return this.i18n.translate(`emails.${templateName}.subject`, { lang });
  }

  async sendVerificationEmail(
    email: string,
    verificationCode: string,
    lang: string = 'zh',
  ): Promise<void> {
    try {
      const context = {
        verificationCode,
        verificationUrl: `${this.configService.get('APP_URL')}/verify?code=${verificationCode}`,
        siteUrl: this.configService.get('APP_URL'),
      };

      const html = await this.renderTemplate('verification', context, lang);

      const subject = this.getEmailSubject('verification', lang);

      await this.transporter.sendMail({
        from: this.configService.get('MAIL_FROM'),
        to: email,
        subject,
        html,
      });

      this.logger.log(`Verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}`, error);
      throw error;
    }
  }

  async sendMagicLinkEmail(
    email: string,
    magicLinkUrl: string,
    lang: string = 'zh',
  ): Promise<void> {
    try {
      const context = {
        magicLinkUrl,
        siteUrl: this.configService.get('APP_URL'),
      };

      const html = await this.renderTemplate('magic-link', context, lang);

      const subject = this.getEmailSubject('magic-link', lang);

      await this.transporter.sendMail({
        from: this.configService.get('MAIL_FROM'),
        to: email,
        subject,
        html,
      });

      this.logger.log(`Magic link email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send magic link email to ${email}`, error);
      throw error;
    }
  }

  async sendWelcomeEmail(email: string, name: string, lang: string = 'zh'): Promise<void> {
    try {
      const context = {
        name,
        siteUrl: this.configService.get('APP_URL'),
      };

      const html = await this.renderTemplate('welcome', context, lang);

      const subject = this.getEmailSubject('welcome', lang);

      await this.transporter.sendMail({
        from: this.configService.get('MAIL_FROM'),
        to: email,
        subject,
        html,
      });

      this.logger.log(`Welcome email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}`, error);
      throw error;
    }
  }

  async sendForgotPasswordEmail(
    email: string,
    resetToken: string,
    expireTime: number,
    lang: string = 'zh',
  ): Promise<void> {
    try {
      const context = {
        expireTime,
        resetUrl: `${this.configService.get('APP_URL')}/reset-password?token=${resetToken}`,
        siteUrl: this.configService.get('APP_URL'),
      };

      const html = await this.renderTemplate('forgot-password', context, lang);

      const subject = this.getEmailSubject('forgot-password', lang);

      await this.transporter.sendMail({
        from: this.configService.get('MAIL_FROM'),
        to: email,
        subject,
        html,
      });

      this.logger.log(`Forgot password email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send forgot password email to ${email}`, error);
      throw error;
    }
  }
}
