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
  id: string;
  email: string;
  name: string;
  handle: string;
  image: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 导出面 OAuth 账号行（令牌列已剔，仅留过期时间与元数据）。
 * @public
 */
export interface ExportedAccount {
  id: string;
  providerId: string;
  accountId: string;
  scope: string | null;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 导出面会话行（token/IP/UA 已剔，仅留生命周期元数据）。
 * @public
 */
export interface ExportedSession {
  id: string;
  provider: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 导出面同意台账行（evidence 不外泄，仅留目的/版本/时点）。
 * @public
 */
export interface ExportedConsent {
  id: string;
  purpose: string;
  version: string;
  grantedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * PIPL 个人数据导出体（四段聚合：user/accounts/sessions/consents）。
 * @public
 */
export interface UserDataExportReadModel {
  user: ExportedUser;
  accounts: ExportedAccount[];
  sessions: ExportedSession[];
  consents: ExportedConsent[];
}
