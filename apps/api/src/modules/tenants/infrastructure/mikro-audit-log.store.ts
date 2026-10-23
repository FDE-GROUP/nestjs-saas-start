import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { AuditLog } from '@app/modules/tenants/infrastructure/entities/audit-log.entity';
import type {
  AuditLogEntry,
  AuditLogStore,
} from '@core/saas-kit/shared-kernel/audit/audit-log.store';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `AuditLogStore` 的 **MikroORM 适配**（`AUDIT_LOG_STORE` 绑定·global-governance-lifecycle-consolidation
 * 切片 E·约束③「另立显式 `audit_log` 表」）。
 *
 * 唯一写通道·居 `modules/tenants/**`（`audit_log` 属主=tenants·§3 裁点③）：`append` 即
 * `em.create + persist + flush` 单行追加（append-only·无 UPDATE/DELETE 原语·账本不可篡改是端口形状层面的保证）。
 * 端口 `AuditLogEntry.from/to`（TS 语义名）映射到非保留字物理列 `fromStatus/toStatus`（避 SQL 关键字·
 * 沿 `before/after` 先例）。`id` 自增、`createdAt` 走 DB 默认 `now()`（Mikro 缺省不写该列）；每次 `fork()` 取独立 em。
 * S9 教训：非 controller provider 必须显式 `@Inject` token + 值导入。
 */
@Injectable()
export class MikroAuditLogStore implements AuditLogStore {
  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async append(entry: AuditLogEntry): Promise<void> {
    const em = await this.mikro.fork();
    const row = em.create(AuditLog, {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      fromStatus: entry.from ?? null,
      toStatus: entry.to ?? null,
      actorId: entry.actorId ?? null,
      reason: entry.reason ?? null,
      correlationId: entry.correlationId ?? null,
      createdAt: new Date(),
    });
    await em.persist(row).flush();
  }
}
