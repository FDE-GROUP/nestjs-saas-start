/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
/**
 * PIPL data-portability read model (C1 · FR-7 · right to access / copy).
 *
 * SECURITY: intentionally EXCLUDES all credential material —
 *   - no password / accessToken / refreshToken / idToken / session token
 *   - no consent.evidence (may carry IP / UA — internal audit only, not returned)
 * The subject is entitled to their own *personal data*, not to their secrets.
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

export interface ExportedSession {
  id: string;
  provider: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportedConsent {
  id: string;
  purpose: string;
  version: string;
  grantedAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDataExportReadModel {
  user: ExportedUser;
  accounts: ExportedAccount[];
  sessions: ExportedSession[];
  consents: ExportedConsent[];
}
