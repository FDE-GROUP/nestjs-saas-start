import type { ResponseErrorDetail } from '@saas/contracts/index';
import type { ValidationError } from 'class-validator';

/**
 * 结构化错误明细（就绪预备 §2.3 #3 · 切片 A · 丙裁）：契约单源已上移 `@saas/contracts`
 * （S7a·③ 裁定）——本处只留类型再导出（消费方 import 路径不变）与 class-validator 展平器。
 * RFC 9457 `errors` 思想，但**不换响应壳**——`ErrorResponse.errors?` 为可选加法字段，
 * 顶层 `message`（string | string[]）逐字保留以兼容既有消费者。
 */
export type { ResponseErrorDetail } from '@saas/contracts/index';

/**
 * 把 class-validator 的 `ValidationError` 树展平为字段级明细（与 nestjs-i18n
 * `flattenValidationErrors` 同口径遍历 children，但保留 `property` 作 path）。
 * 一个叶子节点的每条约束各产一行（与顶层 `message` 数组的粒度一致）。
 */
export function fromValidationErrors(errors: readonly ValidationError[]): ResponseErrorDetail[] {
  const out: ResponseErrorDetail[] = [];
  const walk = (nodes: readonly ValidationError[], prefix: string) => {
    for (const node of nodes) {
      const path = prefix ? `${prefix}.${node.property}` : node.property;
      const constraints = node.constraints ?? {};
      for (const message of Object.values(constraints)) {
        out.push({ path, message });
      }
      if (node.children?.length) {
        walk(node.children, path);
      }
    }
  };
  walk(errors, '');
  return out;
}
