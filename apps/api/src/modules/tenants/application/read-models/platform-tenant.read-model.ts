/** 返回形状（read shape）：query handler 的出参类型——**非** CQRS 物化投影（读写同库同模型·架构精度修宪 S5 正名）。 */
/**
 * Platform governance read-model projections (FR-6 · S5 · CQRS read side).
 * Shapes are owned by the domain port (see `domain/repositories/tenant-governance.repository`);
 * this module re-exports them for application/controller consumption.
 * Cross-tenant by design — the platform operator sees every tenant; these shapes
 * must never leak into tenant-scoped slices.
 */
export type {
  PlatformTenantPage,
  PlatformTenantRow,
  TenantDiagnostics,
} from '../../domain/repositories/tenant-governance.repository';
