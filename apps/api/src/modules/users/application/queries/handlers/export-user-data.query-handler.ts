import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  Account,
  Consent,
  Session,
  User,
} from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { Inject, NotFoundException } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { UserDataExportReadModel } from '../../read-models/user-data-export.read-model';
import { ExportUserDataQuery } from '../export-user-data.query';

/**
 * PIPL 右-access 用户数据导出读处理器（MikroORM 适配·四表读全走 `fields` 白名单投影·R-B1 凭据永不落 SELECT）。
 *
 * @remarks
 * ORM 修宪案 B · 切片 3d（S-d4）—— PIPL 右-access 用户数据导出读面的 **MikroORM 适配**（原地换轨·旧
 * 旧 ORM 数据访问逻辑随本文件替换·回滚点＝git 历史 + §5.18 记录）。
 *
 * **R-B1 安全红线（凭据永不落 SELECT）**：四表（user/account/session/consent）读全部走 `em.find`/`findOne`
 * 的 **`fields` 白名单投影**——凭据列（`user.password`/`user.isOwner`、`account.{password,accessToken,
 * refreshToken,idToken}`、`session.{token,ipAddress,userAgent}`、`consent.evidence`）**不在投影列表内**，
 * 依 3c-ii-B 探针结论在生成的 SQL SELECT 面即被排除（非取回后删）。缺省不投影时 QB `select .*` 会取回，
 * 故投影必做。与旧版 `columns`/`select({...})` 显式列集**逐列对齐**（导出语义零漂移）。
 *
 * `Consent` 运行时实体系切片 3d 补入 app-orm（见 `entities.ts`）·此处只读投影·不写。
 * @public
 */
@QueryHandler(ExportUserDataQuery)
export class ExportUserDataQueryHandler
  implements IQueryHandler<ExportUserDataQuery, UserDataExportReadModel>
{
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  /**
   * 四段白名单投影读并拼装导出体（用户查无 → 404）。
   * @param query - 携带目标用户 id 的查询。
   * @returns 凭据剔除后的个人数据导出体。
   *
   * @throws {NotFoundException} 指定 userId 的用户不存在时。
   */
  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ExportUserDataQuery): Promise<UserDataExportReadModel> {
    const em = await this.mikro.fork();

    // user：仅个人数据列（凭据 password/isOwner/dateField 一律排除）。
    const userRow = await em.findOne(User, { id: query.userId } as never, {
      fields: [
        'id',
        'email',
        'name',
        'handle',
        'image',
        'firstName',
        'lastName',
        'role',
        'emailVerified',
        'createdAt',
        'updatedAt',
      ],
    });
    if (!userRow) {
      throw new NotFoundException(`User with ID ${query.userId} not found`, {
        errorCode: ERROR_CODES.USER_NOT_FOUND,
      });
    }

    // account：排除 password/accessToken/refreshToken/idToken。
    const accountRows = await em.find(Account, { userId: query.userId } as never, {
      fields: [
        'id',
        'providerId',
        'accountId',
        'scope',
        'accessTokenExpiresAt',
        'refreshTokenExpiresAt',
        'createdAt',
        'updatedAt',
      ],
    });

    // session：排除 token/ipAddress/userAgent/activeOrganizationId。
    const sessionRows = await em.find(Session, { userId: query.userId } as never, {
      fields: ['id', 'provider', 'expiresAt', 'createdAt', 'updatedAt'],
    });

    // consent：排除 evidence（IP/UA 审计料·内部合规留痕不外泄）。
    const consentRows = await em.find(Consent, { userId: query.userId } as never, {
      fields: ['id', 'purpose', 'version', 'grantedAt', 'revokedAt', 'createdAt', 'updatedAt'],
    });

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        // handle 真实列 NOT NULL DEFAULT ''（Mikro 侧仅为 BA authFlow 测试面声明可空·运行期不触发 ?? ''）。
        handle: userRow.handle ?? '',
        image: userRow.image ?? null,
        firstName: userRow.firstName ?? null,
        lastName: userRow.lastName ?? null,
        role: userRow.role,
        emailVerified: userRow.emailVerified,
        createdAt: userRow.createdAt,
        updatedAt: userRow.updatedAt ?? userRow.createdAt,
      },
      accounts: accountRows.map((a) => ({
        id: a.id,
        providerId: a.providerId,
        accountId: a.accountId,
        scope: a.scope ?? null,
        accessTokenExpiresAt: a.accessTokenExpiresAt ?? null,
        refreshTokenExpiresAt: a.refreshTokenExpiresAt ?? null,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt ?? a.createdAt,
      })),
      sessions: sessionRows.map((s) => ({
        id: s.id,
        provider: s.provider ?? null,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt ?? s.createdAt,
      })),
      consents: consentRows.map((c) => ({
        id: c.id,
        purpose: c.purpose,
        version: c.version,
        grantedAt: c.grantedAt,
        revokedAt: c.revokedAt ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt ?? c.createdAt,
      })),
    };
  }
}
