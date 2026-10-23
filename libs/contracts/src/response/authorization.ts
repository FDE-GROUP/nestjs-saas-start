import { z } from 'zod';
import {
  AUTHORIZATION_ACTION_VALUES,
  AUTHORIZATION_SUBJECT_VALUES,
} from '../request/authorization';

/**
 * 角色/授权面响应契约（S7b·真相源 = `AuthorizationAdminController` 返回类型）。
 * subject/action 词汇复用请求侧内联单源（apps 侧 vocab 对拍锁 vs @core CASL 值域）。
 */
export const organizationRoleViewSchema = z.object({
  id: z.string(),
  /** 角色 key（组织内唯一）。 */
  key: z.string(),
  /** 人面可读名。 */
  name: z.string(),
  /** 系统内置角色（不可改名/删除）。 */
  isSystem: z.boolean(),
});

export const organizationRoleGrantViewSchema = z.object({
  subject: z.enum(AUTHORIZATION_SUBJECT_VALUES),
  action: z.enum(AUTHORIZATION_ACTION_VALUES),
  /** CASL 条件（白名单字段）；null = 无约束。值面自由透传（strip 只作用于本层键）。 */
  conditions: z.record(z.string(), z.unknown()).nullable(),
});
