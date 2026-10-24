import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatusService } from '../modules/organizations/lifecycle/user-status.service';
import { ERROR_CODES } from '../shared-kernel/errors/error-codes';
import {
  type RequestSessionReader,
  SESSION_READER,
} from '../tenant-isolation/session/request-session.port';
import { PLATFORM_SETTINGS, type PlatformSettings } from './platform-config.port';
import { PLATFORM_IDENTITY_LOOKUP, type PlatformIdentityLookup } from './platform-identity.port';

/**
 * 平台级权限守卫（FR-11 三层之顶层 · FR-13 · S5 正式判据）。
 *
 * @remarks
 * 全局唯一 Platform Operator = 会话用户的 **DB email 命中 `platform.operatorEmail` 配置**
 * （开发者设定 · seed 保障该行存在 · 不可自助注册 / 不由他人任命）。泛 `role=ADMIN` 不再
 * 持有平台权（S4 过渡判据已收敛）。email 据实读 DB（非依赖 session 回传字段），fail-closed：
 * 无会话 401 · 未配置 / 不命中 / 查无此人 403。变更经营者 = 开发者改配置（FR-13，无互任机制）。
 *
 * S6 · FR-10/FR-11①：经营者自身亦为用户，若被暂停则平台层访问同样 fail-closed（纵深防御·
 * 与 session 硬删互补，防重登绕过）。
 *
 * §9.5.4①B · P1b：会话经 core 自有 `RequestSessionReader` 端口读取（不再 import Better Auth
 * 实例 / `@app/modules/auth`）·适配侧 `resolveRequestSession` 按请求记忆→与中间件共用一次 getSession。
 * §9.5.3 热点③ · P1c：平台配置经 core 自有 `PlatformSettings` 端口（不再 import `@app/config`）。
 *
 * @public
 */
@Injectable()
export class PlatformOperatorGuard implements CanActivate {
  constructor(
    @Inject(SESSION_READER) private readonly session: RequestSessionReader,
    @Inject(PLATFORM_IDENTITY_LOOKUP) private readonly identity: PlatformIdentityLookup,
    @Inject(PLATFORM_SETTINGS) private readonly settings: PlatformSettings,
    @Inject(UserStatusService) private readonly userStatus: UserStatusService,
  ) {}

  /**
   * 裁决：无会话 401；被封禁 / 未配置 / email 不命中 / 查无此人 403；命中唯一经营者放行。
   *
   * @param context - Nest 执行上下文（取 HTTP 请求头以读会话）
   * @returns 放行返回 `true`；否则抛 `UnauthorizedException` / `ForbiddenException`
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();

    const view = await this.session.read(req);
    const userId = view?.userId;
    if (!userId)
      throw new UnauthorizedException('Missing or invalid session', {
        errorCode: ERROR_CODES.AUTH_SESSION_INVALID,
      });

    // FR-10: a suspended platform user loses platform-layer access too.
    if (await this.userStatus.isBlocked(userId))
      throw new ForbiddenException('Account suspended', {
        errorCode: ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
      });

    const operatorEmail = this.settings.operatorEmail()?.trim().toLowerCase();
    if (!operatorEmail)
      throw new ForbiddenException('Platform operator not configured', {
        errorCode: ERROR_CODES.ORG_OPERATOR_NOT_CONFIGURED,
      });

    const email = (await this.identity.emailOf(userId))?.toLowerCase();
    if (!email || email !== operatorEmail)
      throw new ForbiddenException('Platform operator only', {
        errorCode: ERROR_CODES.ORG_OPERATOR_ONLY,
      });
    return true;
  }
}
