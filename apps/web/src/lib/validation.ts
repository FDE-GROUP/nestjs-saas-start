/**
 * 客户端提交前置校验（共享基元·纯前端）：复用 `@saas/contracts` 的同一 zod schema
 * （与后端 `@Body({ schema })` 单源），命中即本地拦截、免无效往返。
 *
 * `issue.message` 恒为 i18n key（`reqString`/`.regex({ error })` 设计所致·见 contracts/helpers），
 * 故此处按 key 给友好中文，即服务端「校验本地化」的前端同键保形镜像，可正确区分必填与格式；
 * 未命中 key 回落原始 message。返回 `null` 表示通过。
 */
const VALIDATION_TEXTS: Record<string, string> = {
  'validate.title.required': '标题不能为空',
  'validate.name.required': '名称不能为空',
  'validate.slug.required': 'Slug 不能为空',
  'validate.slug.invalid': 'Slug 格式不正确（仅限小写字母、数字与连字符，且不以连字符开头或结尾）',
  'validate.email.required': '邮箱不能为空',
  'validate.role.required': '角色不能为空',
};

/**
 * 结构化形：只声明 `safeParse` 契约即可（不引 zod 泛型类型、零断言、零 type-escape），
 * `ZodObject` 结构可赋值于此。
 */
interface Parseable {
  safeParse(
    data: unknown,
  ):
    | { success: true; data: unknown }
    | { success: false; error: { issues: readonly { message: string }[] } };
}

/** 用共享 schema 校验表单值：通过返 `null`，否则返以「；」连接的友好中文文案。 */
export function clientValidate(schema: Parseable, values: unknown): string | null {
  const result = schema.safeParse(values);
  if (result.success) return null;
  const issues = result.error.issues;
  if (issues.length === 0) return '输入不合法';
  return issues.map((it) => VALIDATION_TEXTS[it.message] ?? it.message).join('；');
}
