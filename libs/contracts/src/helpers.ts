import { z } from 'zod';

/**
 * 必填非空串基元：把 class-validator 的 `@IsString() + @IsNotEmpty({ message: key })` 换轨为 zod。
 *
 * @remarks
 * 并**修正旧管 G3 隐患**——旧管下「字段缺失」走 `@IsString` 泄漏默认英文，只「present 且空」才回 key；
 * 本 helper 让「缺失 / 空串 / 类型错」三态均回同一 i18n key（S0 探针实跑坐实 code 分别
 * invalid_type / too_small / invalid_type，message 恒为 key）。
 *
 * key 语义进 `issue.message`，由 S5 的 i18n 过滤器翻译；未命中 key 则原样透传（与旧「非 key 消息透传」一致）。
 *
 * @param key - 校验失败回传的 i18n key（作为 `issue.message`）。
 * @returns 必填非空 zod 字符串 schema。
 * @internal
 */
export function reqString(key: string) {
  return z.string({ error: key }).min(1, { error: key });
}

/**
 * 必填非空串 + 长度上界基元（承 followups 项②「业务文本入参无 maxLength」输入卫生）。
 *
 * @remarks
 * 超界回 `validate.text.maxLength`（三语可译），与 `reqString` 同走 i18n `issue.message` 通道。
 *
 * @param key - 必填/空串失败回传的 i18n key。
 * @param max - 长度上界（超界回 `validate.text.maxLength`）。
 * @returns 必填非空且带上界的 zod 字符串 schema。
 * @internal
 */
export function reqStringMax(key: string, max: number) {
  return z
    .string({ error: key })
    .min(1, { error: key })
    .max(max, { error: 'validate.text.maxLength' });
}

/**
 * 可选串 + 长度上界基元（content/search 等「present 才校验」面）。
 *
 * @remarks
 * 未给即过；present 且超界回 `validate.text.maxLength`。不加 `min(1)` 保持原可选语义（允许空串）。
 *
 * @param max - 长度上界。
 * @returns 可选、带上界的 zod 字符串 schema。
 * @internal
 */
export function optStringMax(max: number) {
  return z.string().max(max, { error: 'validate.text.maxLength' }).optional();
}
