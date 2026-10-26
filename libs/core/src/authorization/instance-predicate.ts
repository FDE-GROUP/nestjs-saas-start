/**
 * grant conditions → Mikro `FilterQuery` 片段的**受限转换器**
 * （module-rbac-query-level-filtering 切片 A · query 级列表过滤的读侧机制单点）。
 *
 * 定位：把 dynamic-roles S4 已确立的 check 级实例 conditions 语义（CASL mongo 匹配单资源），
 * 延伸为**列表面**的仓储谓词——同一角色 + 同一 userId 下，列表可见集 = 逐条 `can()` 允许集
 * （「列表 ⊆ 逐条」一致性由本函数与 CASL 共享同一 grammar 保证）。
 *
 * 纯函数：零 Nest / 零 DB / 零 Mikro import——只产 `Record<string, unknown>` where 片段，
 * 由参考应用侧的 Mikro 仓储 `as never` 下推（同 `mikro-post.repository` 既有惯例）。
 *
 * grammar（与写侧 `isValidGrantConditions` 白名单**逐字同形**·防两侧漂移；见 plan §4 人裁①）：
 *  - 顶层：非空对象，字段名为普通词（不含 `$` 前缀）；
 *  - 每个值 ∈ ① 原始量（string/number/boolean/null·等值）② `{ $in: [原始量, ...] }`（非空数组）；
 *  - `{{userId}}` / `{{organizationId}}` 模板：标量与 `$in` 元素皆解析为当前上下文实值（复用 S4 `resolveConditions` 语义·
 *    第三次复裁切片 2 补 org 轴，与 checker `resolveConditions` 共享同一 grammar）。
 *  - **缺对应实值 ⇒ 留字面模板**：DB 层 `ownerId = '{{userId}}'` / `organizationId = '{{organizationId}}'` / `$in` 含字面模板必落空 = 匹配空集
 *    （保守 deny·与 check 级「等值落空 deny」同向，绝不回退全量）。
 *  - **grammar 外即 throw**（不静默放行）：其它 `$` 运算符（`$gt/$regex` 等）/ 直接数组值 / 空 `$in`
 *    / 非-$in 嵌套对象 / 值面函数·undefined——交调用点（checker `listPredicate`）catch 后归空集谓词。
 *    写侧闸本已挡这些形，此处为读侧第二道保险（防手工改库/历史脏行）。
 */

const USER_TEMPLATE = '{{userId}}';
const ORG_TEMPLATE = '{{organizationId}}';
const IN_OPERATOR = '$in';

/** 原始量：mongo 等值 / $in 元素允许的唯一值形（与写侧闸同判）。 */
function isPrimitive(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * 解析标量里的 `{{userId}}` / `{{organizationId}}` 模板；非字符串原样返回，缺对应实值留字面模板（→ DB 落空 deny）。
 */
function resolveScalar(value: string, userId?: string, organizationId?: string): string {
  let out = value;
  if (out.includes(USER_TEMPLATE) && userId !== undefined) {
    out = out.split(USER_TEMPLATE).join(userId);
  }
  if (out.includes(ORG_TEMPLATE) && organizationId !== undefined) {
    out = out.split(ORG_TEMPLATE).join(organizationId);
  }
  return out;
}

/**
 * 单值译词：原始量 → 等值；`{ $in: [原始量...] }`（非空）→ Mikro 同名 `$in` 操作符。
 * grammar 外抛错（调用点按 fail-closed 处置）。
 */
function translateValue(
  field: string,
  value: unknown,
  userId?: string,
  organizationId?: string,
): Record<string, unknown> {
  if (isPrimitive(value)) {
    return {
      [field]: typeof value === 'string' ? resolveScalar(value, userId, organizationId) : value,
    };
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === IN_OPERATOR) {
      const raw = (value as Record<string, unknown>)[IN_OPERATOR];
      if (Array.isArray(raw) && raw.length > 0 && raw.every(isPrimitive)) {
        return {
          [field]: {
            [IN_OPERATOR]: raw.map((el) =>
              typeof el === 'string' ? resolveScalar(el, userId, organizationId) : el,
            ),
          },
        };
      }
    }
  }
  throw new Error(
    `unsupported grant conditions value for field "${field}"（grammar 外·见 instance-predicate 头注）`,
  );
}

/**
 * 把单条 grant 行的 conditions 译为 Mikro where 片段（行内多字段 = AND·CASL conditions 同语义）。
 *
 * @remarks
 * 入参 conditions 必须是写侧闸放行的形；否则逐值 throw。空对象视为调用方误用（应传 null 走类型级），抛错。
 *
 * @param conditions - 单条 grant 行的 conditions（写侧闸已放行的形）
 * @param userId - 当前操作者 id（解 `{{userId}}` 模板·缺省留字面模板落空 deny）
 * @param organizationId - 活动组织 id（解 `{{organizationId}}` 模板·缺省留字面模板落空 deny）
 * @returns Mikro where 片段（字段间 AND）
 * @public
 */
export function toMikroPredicate(
  conditions: Record<string, unknown>,
  userId?: string,
  organizationId?: string,
): Record<string, unknown> {
  const entries = Object.entries(conditions);
  if (entries.length === 0) {
    throw new Error('empty conditions object（无 instance 限制应走类型级 null·见 plan §切片 B）');
  }
  const out: Record<string, unknown> = {};
  for (const [field, value] of entries) {
    Object.assign(out, translateValue(field, value, userId, organizationId));
  }
  return out;
}

/**
 * 多 grant 行合并（人裁②·$or 并语义·与 CASL check 级并语义同解）。
 *
 * @remarks
 *  - 传入各行为**已判定带 conditions** 的行译词（调用点已筛掉 conditions=null 的类型级行·那些行
 *    令调用点直接返回 `null` 全量，不进此函数）；
 *  - 空数组 = 无任何匹配行 ⇒ 返回 `undefined`，由调用点归**空集谓词**（fail-closed）；
 *  - 单行 = 直接返回该译词（省一层 `$or`）；
 *  - 多行 = `{ $or: [row1, row2, ...] }`（Mikro 顶层布尔微语法）。
 *
 * @param rowPredicates - 各 grant 行已译出的 where 片段（只读）
 * @returns 合并后的谓词；空数组返回 `undefined`（调用点归空集）
 * @public
 */
export function mergePredicatesWithOr(
  rowPredicates: readonly Record<string, unknown>[],
): Record<string, unknown> | undefined {
  if (rowPredicates.length === 0) return undefined;
  if (rowPredicates.length === 1) return rowPredicates[0];
  return { $or: [...rowPredicates] };
}
