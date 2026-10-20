import { TenantRejectedEvent } from '@core/saas-kit/modules/tenants/lifecycle/events/tenant-rejected.event';
import {
  TENANT_STATUS,
  type TenantStatus,
} from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle';
import { replayTenantLifecycle } from '@core/saas-kit/modules/tenants/lifecycle/tenant-lifecycle-fold';
import { TenantStatusService } from '@core/saas-kit/modules/tenants/lifecycle/tenant-status.service';
import { PlatformAuditService } from '@core/saas-kit/platform/platform-audit.service';
import { currentRequestId } from '@core/saas-kit/shared-kernel/context/request-context';
import { ES_TRUTH_SOURCE_TENANTS } from '@core/saas-kit/shared-kernel/domain/es-truth-source.port';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import { EVENT_STORE, type EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '@core/saas-kit/shared-kernel/domain/unit-of-work.port';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ConflictException, Inject, Optional } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  TENANT_PROVISIONING_REPOSITORY,
  type TenantProvisioningRepository,
} from '../../../domain/repositories/tenant-provisioning.repository';
import { RejectTenantCommand } from '../reject-tenant.command';

/**
 * 驳回申请（FR-1·平台级）：硬删 pending 组织行（FK 级联清 member/invitation·pending 期零业务
 * 数据）。S5 收紧：仅显式 `pending_approval` 可驳回——已生效/无状态存量 → 409（生效租的暂停/
 * 删除走治理端点），目标不存在 → false（控制层转 404）。成败均经 PlatformAuditService 落
 * 结构化审计（FR-6）。
 * ES 第四切片：硬删成功（removed=true）后产出 `tenant.rejected` 耐久事件——org 行物理
 * 消失后这是「存在过并被驳回」的唯一痕迹（not-found/409 零发·失败连带 500）。
 * Phase B 后半（module-es-outbox-transactional 切片 B）：remove + 发布关键段包入
 * `UNIT_OF_WORK`（outbox 同事务原子·shadow 连带回滚·inproc 空转等价）。
 */
@CommandHandler(RejectTenantCommand)
export class RejectTenantCommandHandler implements ICommandHandler<RejectTenantCommand> {
  constructor(
    @Inject(TENANT_PROVISIONING_REPOSITORY)
    private readonly provisioning: TenantProvisioningRepository,
    @Inject(TenantStatusService) private readonly status: TenantStatusService,
    @Inject(PlatformAuditService) private readonly audit: PlatformAuditService,
    // S9 教训：显式 @Inject token + 值导入，防 swc design:paramtypes 退化
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    // ES Phase B 后半：ambient UoW（MikroOrmModule @Global 装配·单测直 new 传 pass-through）
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    // ES R1c 真相源写切换：两参 @Optional + 缺省——旋钮关时既有五参 `new(...)` 逐字节不变；
    // 开时 EVENT_STORE 由 @Global DatabaseModule 供·truthSource 由 TenantsModule useFactory 注入。
    @Optional() @Inject(EVENT_STORE) private readonly eventStore?: EventStore,
    @Optional() @Inject(ES_TRUTH_SOURCE_TENANTS) private readonly truthSource = false,
  ) {}

  async execute(command: RejectTenantCommand): Promise<boolean> {
    // 真相源开：前置态从 fold 重放态取（裁决输入不再靠表行）；同时缓存流长供 expectedVersion。
    const stream = this.truthSource
      ? await this.eventStore?.load('tenant', command.organizationId)
      : undefined;
    const current: TenantStatus | undefined = this.truthSource
      ? replayTenantLifecycle(stream ?? [])?.status
      : await this.status.read(command.organizationId);
    // 仅显式 pending 可驳回。read 对「不存在/无状态存量」均返回 undefined，无法在此区分：
    // 非 pending 的已知名（active/suspended 等）直接 409；undefined 交给 remove 谓词裁决
    //（命中 0 行 → false → 控制层 404；驳回路径 以 pending 为唯一合法域，FR-1 语义）。
    if (current !== undefined && current !== TENANT_STATUS.PENDING) {
      this.audit.logTenantGovernance('reject', command.organizationId, command.operatorId, {
        from: current,
        error: 'not_pending',
      });
      throw new ConflictException(
        `Only pending applications can be rejected (status: ${current})`,
        {
          errorCode: ERROR_CODES.TENANCY_NOT_PENDING,
        },
      );
    }
    const removed = await this.uow.run(() =>
      this.provisioning.remove(command.organizationId).then(async (r) => {
        if (r) {
          const event = new TenantRejectedEvent({
            aggregateId: command.organizationId,
            // 关联 id 统一链（FR-4）：请求内非空，后台/脚本场景 undefined → 持久化仍落 null。
            correlationId: currentRequestId(),
            payload: { actorId: command.operatorId },
          });
          if (this.truthSource) {
            // 真相源写路径：带乐观锁耐久 append（expectedVersion=流长+1），不再走 publishAll（免二次 append）。
            if (!this.events.publishDurable) {
              throw new Error(
                'ES_TRUTH_SOURCE_TENANTS=true 要求发布器实现 publishDurable（reject 写路径）',
              );
            }
            await this.events.publishDurable([event], (stream?.length ?? 0) + 1);
          } else {
            await this.events.publishAll([event]);
          }
        }
        return r;
      }),
    );
    this.audit.logTenantGovernance('reject', command.organizationId, command.operatorId, {
      from: removed ? TENANT_STATUS.PENDING : current,
      to: TENANT_STATUS.DELETED,
      error: removed ? undefined : 'not_found',
    });
    return removed;
  }
}
