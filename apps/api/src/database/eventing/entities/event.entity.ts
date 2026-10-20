import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from '../../mikro/column-meta';

/**
 * `event` 表列元数据单源 + 运行时扁平实体（global-entity-context-placement 切片 B 归位：
 * 原 `database/mikro/four-tables.ts`·判据=`table-ownership.ts` 表属主 `event→database`——
 * ES 事件表属平台基建，落 `database/eventing/entities/` 与事件 stores/relay 同区）。
 * 同源双变体语义与相对导入约束见 `workspace.entity.ts` 头注。
 */

export const EVENT_META: TableMeta = {
  name: 'Event',
  tableName: 'event',
  columns: [
    ['id', { k: 'bigintAutoPk' }],
    ['eventId', { k: 'text' }],
    ['aggregateId', { k: 'text' }],
    ['aggregateType', { k: 'text' }],
    ['version', { k: 'integer' }],
    ['eventType', { k: 'text' }],
    ['eventVersion', { k: 'integer', default: 1 }],
    ['payload', { k: 'json' }],
    ['metadata', { k: 'json', nullable: true }],
    ['occurredAt', { k: 'datetime' }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    // ES Phase B 后半（module-es-outbox-transactional 切片 A）：outbox 投递状态列——
    // dispatchedAt 为空即未投递（at-least-once：relay 投递成功后置位）；attemptCount/lastError
    // 承载重试上限与行级拒收留痕（DLQ 以表内状态表达，不建独立死信表）。时间列同基线无 tz 口径。
    ['dispatchedAt', { k: 'datetime', nullable: true }],
    ['attemptCount', { k: 'integer', default: 0 }],
    ['lastError', { k: 'text', nullable: true }],
  ],
  uniques: [
    {
      name: 'event_aggregate_version_key',
      properties: ['aggregateType', 'aggregateId', 'version'],
    },
    { name: 'event_event_id_key', properties: ['eventId'] },
  ],
  indexes: [
    { name: 'event_aggregate_idx', properties: ['aggregateType', 'aggregateId'] },
    // relay 拉取面（WHERE dispatched_at IS NULL ORDER BY id）：普通索引即可支撑——
    // `TableMeta.indexes` 能力面不支持部分索引（partial where），为模板小表不扩列元数据机制（偏差不掩痕已登 plan §4.1）。
    { name: 'event_dispatched_idx', properties: ['dispatchedAt'] },
  ],
};

export interface Event {
  id: number;
  eventId: string;
  aggregateId: string;
  aggregateType: string;
  version: number;
  eventType: string;
  eventVersion: number;
  payload: Record<string, any>;
  metadata?: Record<string, any> | null;
  occurredAt: Date;
  createdAt: Date;
  dispatchedAt?: Date | null;
  attemptCount: number;
  lastError?: string | null;
}
export const Event: EntitySchema<Event> = buildRuntimeEntity(EVENT_META) as EntitySchema<Event>;
