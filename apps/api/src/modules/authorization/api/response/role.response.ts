import {
  AUTHORIZATION_ACTION_VALUES,
  AUTHORIZATION_SUBJECT_VALUES,
  type AuthorizationAction,
  type AuthorizationSubject,
} from '@core/saas-kit/authorization/authorization-rules';
import { ApiProperty } from '@nestjs/swagger';
import type {
  organizationRoleGrantViewSchema,
  organizationRoleViewSchema,
} from '@saas/contracts/index';
import type { z } from 'zod';
import type {
  OrganizationRoleGrantView,
  OrganizationRoleView,
} from '../../domain/repositories/organization-rbac.repository';

/**
 * 角色/授权面响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 * 真相源 = `AuthorizationAdminController` 实际返回类型；漂移防线：文末编译期双向赋值锁。
 * subject/action 词汇复用 @core CASL 单源数组（conditions 为白名单自由对象）。
 */
export class OrganizationRoleViewResponse {
  @ApiProperty({ description: 'UUIDv7。' })
  id!: string;

  @ApiProperty({ description: '角色 key（组织内唯一）。' })
  key!: string;

  @ApiProperty({ description: '人面可读名。' })
  name!: string;

  @ApiProperty({ description: '系统内置角色（不可改名/删除）。' })
  isSystem!: boolean;
}

const _trvf: OrganizationRoleViewResponse = {} as OrganizationRoleView;
const _trvb: OrganizationRoleView = {} as OrganizationRoleViewResponse;
void _trvf;
void _trvb;

export class OrganizationRoleGrantViewResponse {
  @ApiProperty({ enum: [...AUTHORIZATION_SUBJECT_VALUES], description: '授权主体词汇。' })
  subject!: AuthorizationSubject;

  @ApiProperty({ enum: [...AUTHORIZATION_ACTION_VALUES], description: '动作词汇。' })
  action!: AuthorizationAction;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'CASL 条件（白名单字段）；null = 无约束。',
  })
  conditions!: Record<string, unknown> | null;
}

const _trgf: OrganizationRoleGrantViewResponse = {} as OrganizationRoleGrantView;
const _trgb: OrganizationRoleGrantView = {} as OrganizationRoleGrantViewResponse;
void _trgf;
void _trgb;

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 真相源。——
const _arv1: z.infer<typeof organizationRoleViewSchema> = {} as OrganizationRoleView;
const _arv2: OrganizationRoleView = {} as z.infer<typeof organizationRoleViewSchema>;
const _agv1: z.infer<typeof organizationRoleGrantViewSchema> = {} as OrganizationRoleGrantView;
const _agv2: OrganizationRoleGrantView = {} as z.infer<typeof organizationRoleGrantViewSchema>;
void _arv1;
void _arv2;
void _agv1;
void _agv2;
