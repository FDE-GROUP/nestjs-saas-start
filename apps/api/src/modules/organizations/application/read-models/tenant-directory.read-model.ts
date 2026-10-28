/**
 * 租户目录读投影出口（module-mcp-agent-surface 切片 2·features 消费面 B 倒置件）。
 *
 * @remarks
 * feature 隔离闸 B 面禁 `features/**` 深引 `modules/<ctx>/domain|infrastructure/`——跨上下文
 * 消费租户目录时，条目形状自 **application 公开面**转发。本件是薄再导出（零第二型）：权威
 * 定义仍居 `domain/repositories/tenant-directory.repository`，此处只做出口、不复制结构。
 *
 * @public
 */
export type {
  TenantDirectoryEntry,
  TenantDirectoryOrganization,
} from '../../domain/repositories/tenant-directory.repository';
