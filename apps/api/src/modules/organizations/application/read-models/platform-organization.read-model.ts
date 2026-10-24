/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
/**
 * 平台治理读模型形状（FR-6 · S5 · CQRS 读侧）。形状归属 domain 端口
 * （见 `domain/repositories/organization-governance.repository`），本模块仅 re-export 供
 * application/controller 消费。设计上跨租户——平台经营者可见全部租户，这些形状
 * 绝不泄漏进租户作用域切片。
 */
export type {
  OrganizationDiagnostics,
  PlatformOrganizationPage,
  PlatformOrganizationRow,
} from '../../domain/repositories/organization-governance.repository';
