/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
/**
 * 平台治理读模型形状（FR-6 · S5 · CQRS 读侧）。形状归属 domain 端口
 * （见 `domain/repositories/organization-governance.repository`），本模块仅 re-export 供
 * application/controller 消费。设计上跨租户——平台经营者可见全部租户，这些形状
 * 绝不泄漏进租户作用域切片。
 *
 * rehierarchy 片一（治理台改锚 tenant·准入态归位）：跨租列表/详情读形升为 **tenant 主键**（准入态权威住
 * `tenant.status`）；`OrganizationDiagnostics`（org 级下钻·经租户详情抵达）随迁保留于此读面。
 */
export type {
  OrganizationDiagnostics,
  PlatformTenantDetail,
  PlatformTenantPage,
  PlatformTenantRow,
} from '../../domain/repositories/organization-governance.repository';
