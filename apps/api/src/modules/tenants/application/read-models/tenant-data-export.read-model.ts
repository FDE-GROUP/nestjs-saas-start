/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
/**
 * 租户级数据导出 read-model（NFR-6 · vision 阶段 3 开段首切片）。
 *
 * SECURITY：形状由 domain port 持有（见 `domain/repositories/tenant-governance.repository`）——
 * 成员仅携带最小身份面（id/name/email/handle），**排除一切凭据 material**
 *（password / accessToken / refreshToken / session token / consent.evidence），
 * 对齐 users 侧 `user-data-export.read-model` 的同一纪律：数据主体有权取回的是
 * *个人数据*，不是秘密。跨租 by design——仅经 `PlatformOperatorGuard` 裁决后可达，
 * 形状绝不允许流入租户级切片。
 */
export type {
  ExportedTenantMember,
  ExportedTenantUser,
  TenantDataExport,
} from '../../domain/repositories/tenant-governance.repository';
