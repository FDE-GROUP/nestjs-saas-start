/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
import type { UserStatus } from '@core/saas-kit/modules/organizations/lifecycle/user-status.service';

/**
 * 平台用户治理读模型形状（FR-6/FR-10 · S6 · CQRS 读侧）。列表形状归属 domain 端口，
 * 本模块仅 re-export 供 application/controller 消费。写侧（suspend/resume）返回最小
 * `UserGovernanceResult`。设计上跨平台——经营者可见全部用户，这些形状绝不泄漏
 * 进租户作用域切片。
 */
export type { PlatformUserPage } from '../../domain/repositories/user-governance.repository';

/** suspend/resume 迁移成功后的最小回执（供 controller 返回·status 为新态）。 @public */
export interface UserGovernanceResult {
  userId: string;
  status: UserStatus;
}
