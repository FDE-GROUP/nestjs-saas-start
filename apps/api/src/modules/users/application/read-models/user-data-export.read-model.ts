/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
/**
 * PIPL 数据可携导出读模型（C1 · FR-7 · 右-access/副本）。
 *
 * @remarks
 * SECURITY: intentionally EXCLUDES all credential material —
 *   - no password / accessToken / refreshToken / idToken / session token
 *   - no consent.evidence (may carry IP / UA — internal audit only, not returned)
 * The subject is entitled to their own *personal data*, not to their secrets.
 * @public
 */
export interface ExportedUser {
  /** 实体唯一标识 id。 */
  id: string;
  /** 邮箱地址。 */
  email: string;
  /** 名称。 */
  name: string;
  /** 用户名/句柄（唯一标识）。 */
  handle: string;
  /** 头像 URL。 */
  image: string | null;
  /** 名。 */
  firstName: string | null;
  /** 姓。 */
  lastName: string | null;
  /** 角色标识。 */
  role: string;
  /** 邮箱是否已验证。 */
  emailVerified: boolean;
  /** 创建时间。 */
  createdAt: Date;
  /** 更新时间。 */
  updatedAt: Date;
}

/**
 * 导出面 OAuth 账号行（令牌列已剔，仅留过期时间与元数据）。
 * @public
 */
export interface ExportedAccount {
  /** 实体唯一标识 id。 */
  id: string;
  /** 社交/第三方账号提供方。 */
  providerId: string;
  /** 第三方账号在提供方侧 id。 */
  accountId: string;
  /** 授权范围。 */
  scope: string | null;
  /** 访问令牌过期时间。 */
  accessTokenExpiresAt: Date | null;
  /** 刷新令牌过期时间。 */
  refreshTokenExpiresAt: Date | null;
  /** 创建时间。 */
  createdAt: Date;
  /** 更新时间。 */
  updatedAt: Date;
}

/**
 * 导出面会话行（token/IP/UA 已剔，仅留生命周期元数据）。
 * @public
 */
export interface ExportedSession {
  /** 实体唯一标识 id。 */
  id: string;
  /** 社交登录提供方。 */
  provider: string | null;
  /** 过期时间。 */
  expiresAt: Date;
  /** 创建时间。 */
  createdAt: Date;
  /** 更新时间。 */
  updatedAt: Date;
}

/**
 * 导出面同意台账行（evidence 不外泄，仅留目的/版本/时点）。
 * @public
 */
export interface ExportedConsent {
  /** 实体唯一标识 id。 */
  id: string;
  /** 同意用途。 */
  purpose: string;
  /** 版本号/文档版本。 */
  version: string;
  /** 同意授予时间。 */
  grantedAt: Date;
  /** 同意撤回时间。 */
  revokedAt: Date | null;
  /** 创建时间。 */
  createdAt: Date;
  /** 更新时间。 */
  updatedAt: Date;
}

/**
 * PIPL 个人数据导出体（四段聚合：user/accounts/sessions/consents）。
 * @public
 */
export interface UserDataExportReadModel {
  /** 所属用户。 */
  user: ExportedUser;
  /** 账号记录集合。 */
  accounts: ExportedAccount[];
  /** 会话记录集合。 */
  sessions: ExportedSession[];
  /** 同意记录集合。 */
  consents: ExportedConsent[];
}
