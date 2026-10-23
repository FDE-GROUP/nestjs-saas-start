import { SYSTEM_ROLE_KEYS } from '@core/saas-kit/authorization/authorization-rules';

/**
 * 租户 RBAC 写侧策略纯函数（domain · module-rbac-dynamic-roles §2.2 conditions 白名单 / S1 判据）。
 *
 * 零依赖零 IO：自定义角色 key 的词法闸 + grant `conditions` 的形状闸。
 * 写路径（仓储适配器）先过闸再落行——**闸外形状一律拒**（fail-closed），投影侧
 * （CASL matcher）因此只需信任库内形状；读侧无需二次防御。
 */

/** 自定义角色 key 词法：小写字母数字开头 + `-`/`_`，≤64（防怪值、与系统 key/BA 内部值区分）。 */
const ROLE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** 字段名词法：单词字符（mongo 等值匹配的左端；`$` 运算符键在白名单期直接拒·见下）。 */
const FIELD_PATTERN = /^\w{1,64}$/;

export function isReservedRoleKey(key: string): boolean {
  return (SYSTEM_ROLE_KEYS as readonly string[]).includes(key);
}

/** 合法自定义角色 key = 词法过闸 ∧ 非系统保留 key（系统三行由 lazy-ensure 独占）。 */
export function isValidRoleKey(key: string): boolean {
  return ROLE_KEY_PATTERN.test(key) && !isReservedRoleKey(key);
}

/**
 * conditions 白名单（S1 期锁平铺等值 · query 级片 v0.2.0·人裁①扩 `$in`）：**顶层非空对象**——键为
 * 字段名（`\w`），每个值 ∈ ① **原始量**（string/number/boolean/null·等值·`'{{userId}}'` 模板串合法）
 * 或 ② `{ $in: [原始量, ...] }`（**非空数组·元素皆原始量·允许 `{{userId}}` 模板元素**）。
 * 拒绝：空对象（语义含混·要整 subject 级就传 null）、直接数组值、其它嵌套对象（`$gt/$regex` 等
 * 非-$in 运算符、多键对象）、空 `$in`、函数/undefined（JSON 不可达值）。
 * 与读侧转换器 `instance-predicate.ts` **共用同一 grammar**（防存得进、读译不出的漂移）。
 */
export function isValidGrantConditions(conditions: unknown): conditions is Record<string, unknown> {
  if (typeof conditions !== 'object' || conditions === null || Array.isArray(conditions)) {
    return false;
  }
  const entries = Object.entries(conditions);
  if (entries.length === 0) return false;
  for (const [field, value] of entries) {
    if (!FIELD_PATTERN.test(field)) return false;
    if (isPrimitiveValue(value)) continue;
    // 仅放 `$in`：单键对象且值为非空原始量数组；其余嵌套形一律拒。
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length === 1 && keys[0] === '$in') {
        const arr = (value as Record<string, unknown>).$in;
        if (Array.isArray(arr) && arr.length > 0 && arr.every(isPrimitiveValue)) continue;
      }
    }
    return false;
  }
  return true;
}

/** 原始量判定（等值面与 $in 元素共判·与 instance-predicate 同口径）。 */
function isPrimitiveValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/** revoke/grant 等值比较口径：JSON 规范化串（键序稳定化后比较·同格多条件行的精确撤除依据）。 */
export function canonicalConditions(conditions: Record<string, unknown> | null): string {
  if (conditions === null) return 'null';
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(conditions).sort()) sorted[key] = conditions[key];
  return JSON.stringify(sorted);
}
