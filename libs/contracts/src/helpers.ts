import { z } from 'zod';

/**
 * 必填非空串：把 class-validator 的 `@IsString() + @IsNotEmpty({ message: key })` 换轨为 zod，
 * 并**修正旧管 G3 隐患**——旧管下「字段缺失」走 `@IsString` 泄漏默认英文，只「present 且空」才回 key；
 * 本 helper 让「缺失 / 空串 / 类型错」三态均回同一 i18n key（S0 探针实跑坐实 code 分别
 * invalid_type / too_small / invalid_type，message 恒为 key）。
 *
 * key 语义进 `issue.message`，由 S5 的 i18n 过滤器翻译；未命中 key 则原样透传（与旧「非 key 消息透传」一致）。
 */
export function reqString(key: string) {
  return z.string({ error: key }).min(1, { error: key });
}

/**
 * 必填非空串 + 长度上界（承 followups 项②「业务文本入参无 maxLength」输入卫生）。
 * 超界回 `validate.text.maxLength`（三语可译），与 `reqString` 同走 i18n `issue.message` 通道。
 */
export function reqStringMax(key: string, max: number) {
  return z
    .string({ error: key })
    .min(1, { error: key })
    .max(max, { error: 'validate.text.maxLength' });
}

/**
 * 可选串 + 长度上界（content/search 等「present 才校验」面）。
 * 未给即过；present 且超界回 `validate.text.maxLength`。不加 `min(1)` 保持原可选语义（允许空串）。
 */
export function optStringMax(max: number) {
  return z.string().max(max, { error: 'validate.text.maxLength' }).optional();
}
