import { z } from 'zod';

/**
 * PIPL 个人数据导出体（↔ `UserDataExportReadModel`·裁点④**顶层骨架·防脆**）。
 *
 * @remarks
 * 真相源 `apps/api` 侧 `ExportedUser`/`ExportedAccount`/`ExportedSession`/`ExportedConsent`——已刻意剔除全部凭证列
 * （无 password/token/evidence）。本件为**文档/客户端型契约 + 服务端校验**（@Impl 双侧同挂本件 → handler 侧真跑 parse）：
 * `user` 段字段稳定且小 → 逐字段建模（与 `ExportedUser` 同形·无剥落）；`accounts`/`sessions`/`consents` 为记录集，
 * 内层为具名接口（无索引签名）且随 BA 账号面演化 → 采 `z.array(z.unknown())` free-form 逐字透传不剥（防脆）。
 *
 * @public
 */
export const userDataExportViewSchema = z.object({
  /** 所属用户（稳定身份骨架）。 */
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    handle: z.string(),
    role: z.string(),
    emailVerified: z.boolean(),
    image: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    createdAt: z.instanceof(Date),
    updatedAt: z.instanceof(Date),
  }),
  /** OAuth 账号集合（令牌列已剔·内层 free-form）。 */
  accounts: z.array(z.unknown()),
  /** 会话集合（token/IP/UA 已剔·内层 free-form）。 */
  sessions: z.array(z.unknown()),
  /** 同意台账集合（evidence 不外泄·内层 free-form）。 */
  consents: z.array(z.unknown()),
});
