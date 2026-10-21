/**
 * 角色可挂载读端口（领域细化重构 A5·authorization 上下文的 published port）。
 *
 * 接缝背景：`tenants` 的成员/邀请门面（org-admin）在挂角色/发邀请前须校验
 * `role ∈ 系统三 key ∪ 本租户在库自定义角色`——该「角色存在性」知识属 authorization，
 * 不随 RBAC 搬走后让 tenants 直 import 授权侧应用服务类（上下文间只经端口相遇·弱耦合纪律）。
 * 依赖方向：`tenants(核心域) → authorization(支撑域 published port)`。
 * 形状只传标识与布尔（租户自 ALS 隐式取·不外泄角色实体/快照）。
 */
export const ROLE_ASSIGNABILITY_READER = Symbol('ROLE_ASSIGNABILITY_READER');

export interface RoleAssignabilityReader {
  /** 角色可否挂载为成员/邀请角色（查库严格在库 fail-closed·系统三 key 恒真）。 */
  isRoleAssignable(role: string): Promise<boolean>;
}
