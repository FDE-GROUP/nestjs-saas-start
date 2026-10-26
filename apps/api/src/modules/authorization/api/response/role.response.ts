import {
  AUTHORIZATION_ACTION_VALUES,
  AUTHORIZATION_SUBJECT_VALUES,
  type AuthorizationAction,
  type AuthorizationSubject,
} from '@core/saas-kit/authorization/authorization-rules';
import { ApiProperty } from '@nestjs/swagger';
import type { tenantRoleGrantViewSchema, tenantRoleViewSchema } from '@saas/contracts/index';
import type { z } from 'zod';
import type {
  TenantRoleGrantView,
  TenantRoleView,
} from '../../domain/repositories/organization-rbac.repository';

/**
 * 角色/授权面响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 *
 * @remarks
 * 真相源 = `AuthorizationAdminController` 实际返回类型；漂移防线：文末编译期双向赋值锁。
 * subject/action 词汇复用 `@core` CASL 单源数组（conditions 为白名单自由对象）。
 * @public
 */
export class TenantRoleViewResponse {
  /** 角色行 id。 */
  @ApiProperty({ description: 'UUIDv7。' })
  id!: string;

  /** 唯一 key（角色/存储对象）。 */
  @ApiProperty({ description: '角色 key（组织内唯一）。' })
  key!: string;

  /** 角色显示名。 */
  @ApiProperty({ description: '人面可读名。' })
  name!: string;

  /** 是否为内置系统角色（不可改删）。 */
  @ApiProperty({ description: '系统内置角色（不可改名/删除）。' })
  isSystem!: boolean;
}

const _trvf: TenantRoleViewResponse = {} as TenantRoleView;
const _trvb: TenantRoleView = {} as TenantRoleViewResponse;
void _trvf;
void _trvb;

/**
 * 授权行响应契约（与域内 `TenantRoleGrantView` 同形·编译期锁防漂移）。
 * @public
 */
export class TenantRoleGrantViewResponse {
  /** 被授权资源主体。 */
  @ApiProperty({ enum: [...AUTHORIZATION_SUBJECT_VALUES], description: '授权主体词汇。' })
  subject!: AuthorizationSubject;

  /** 授权动作（CASL can 第一元组参）。 */
  @ApiProperty({ enum: [...AUTHORIZATION_ACTION_VALUES], description: '动作词汇。' })
  action!: AuthorizationAction;

  /** 授权条件（ABAC 谓词·平铺等值/$in）。 */
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'CASL 条件（白名单字段）；null = 无约束。',
  })
  conditions!: Record<string, unknown> | null;
}

const _trgf: TenantRoleGrantViewResponse = {} as TenantRoleGrantView;
const _trgb: TenantRoleGrantView = {} as TenantRoleGrantViewResponse;
void _trgf;
void _trgb;

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 真相源。——
const _arv1: z.infer<typeof tenantRoleViewSchema> = {} as TenantRoleView;
const _arv2: TenantRoleView = {} as z.infer<typeof tenantRoleViewSchema>;
const _agv1: z.infer<typeof tenantRoleGrantViewSchema> = {} as TenantRoleGrantView;
const _agv2: TenantRoleGrantView = {} as z.infer<typeof tenantRoleGrantViewSchema>;
void _arv1;
void _arv2;
void _agv1;
void _agv2;
