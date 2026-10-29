import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability';
import type {
  AuthorizationAction,
  AuthorizationSubject,
} from '@core/saas-kit/authorization/authorization-rules';

/**
 * grant 行（DB `tenant_role_grant` / seed 死数据同形）→ CASL ability 的**纯投影**
 * （module-rbac-casl §2.2 换形 · module-rbac-dynamic-roles §2.3）。
 *
 * 本文件不含任何独立权限知识：输入即授权事实（旧 `TENANT_RULES[role]` 静态表输入已随
 * 丙裁删净），逐行 `can(action, subject, conditions?)`。空输入投影为空规则 → 全部拒绝
 * （fail-closed；守卫侧另有前置拦截，此为双保险）。
 * check 级实例 conditions（S4·乙裁）在此承接口径：`conditions` 非空行走 CASL mongo
 * conditions 匹配（`{{userId}}` 模板由 checker 侧在建 ability 前解析，本投影保持无感）。
 */
/**
 * 实例 subject（S4·check 级 detached 形）：`__caslSubjectType__` 作判别键 + 任意资源属性。
 * CASL v7 判定同时支持「类型名字符串」（类型级）与此「实例对象」（带 conditions 的
 * check 级·先取资源再判），故 ability 的 subject 泛型须为两者之并——node10 旧解析把
 * @casl 类型退成宽松形而掩盖了这点，bundler 经 exports 拿到 v7 真类型后须显式建模。
 */
export type CaslSubjectInstance = { __caslSubjectType__: AuthorizationSubject } & Record<
  string,
  unknown
>;

export type CaslScopedAbility = MongoAbility<
  [AuthorizationAction, AuthorizationSubject | CaslSubjectInstance]
>;

/** 投影输入行：与 `tenant_role_grant` 行、seed grant 皆同构（subject×action×conditions）。 */
export interface ScopedAbilityGrant {
  readonly subject: AuthorizationSubject;
  readonly action: AuthorizationAction;
  readonly conditions?: Record<string, unknown> | null;
}

export function buildScopedAbility(grants: readonly ScopedAbilityGrant[]): CaslScopedAbility {
  const { can, build } = new AbilityBuilder<CaslScopedAbility>(createMongoAbility);
  for (const grant of grants) {
    if (grant.conditions) can(grant.action, grant.subject, grant.conditions as object);
    else can(grant.action, grant.subject);
  }
  return build();
}
