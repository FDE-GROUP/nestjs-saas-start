import { z } from 'zod';

/**
 * odoo-rpc feature 传输契约单源（承 tooling-standards §3「feature 叠加层契约例外」：
 * 契约随源码居 feature 侧，不入 `@saas/contracts`、不进公共 openapi 对拍）。
 *
 * 前端（`apps/odoo-rpc-web`）经 vite alias 直指本文件 import——前后端单源，
 * 与公共仓 contracts 同一纪律，仅公开面取舍不同（controller 退出公共 openapi）。
 * @public
 */

/** 列表查询：limit 夹逼 1..50（上游 search_read 的成本闸门，缺省 20）。 */
export const odooListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
/** `odooListQuerySchema` 的载荷型（@Query({ schema }) 注解用）。 */
export type OdooListQuery = z.infer<typeof odooListQuerySchema>;

/**
 * 客户视图（res.partner·白名单字段）。email 上游可能缺失或 False——client 层统一
 * 归一为 null（防御面见 odoo-read.service 头注）。
 */
export const odooPartnerViewSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().nullable(),
});
/** `odooPartnerViewSchema` 的载荷型。 */
export type OdooPartnerView = z.infer<typeof odooPartnerViewSchema>;

/** 商品模板视图（product.template·白名单字段；list_price 上游恒为 float 或 False→归一 0）。 */
export const odooProductViewSchema = z.object({
  id: z.number(),
  name: z.string(),
  listPrice: z.number(),
});
/** `odooProductViewSchema` 的载荷型。 */
export type OdooProductView = z.infer<typeof odooProductViewSchema>;

/** 只读列表信封：items 截断至 limit，total 为上游 search_count（演示「真实计数 + 分页语义」）。 */
export const odooListEnvelopeSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
  });
/** 客户列表响应形。 */
export type OdooPartnerList = z.infer<
  ReturnType<typeof odooListEnvelopeSchema<typeof odooPartnerViewSchema>>
>;
/** 商品列表响应形。 */
export type OdooProductList = z.infer<
  ReturnType<typeof odooListEnvelopeSchema<typeof odooProductViewSchema>>
>;

/**
 * 真实 HTTP wire 形：全局 `TransformInterceptor` 成功信封 `{data, statusCode, message}`。
 *
 * 口径与 @saas/contracts envelope.ts 同源（真相源=实存件行为：非分页返回值走 Normal
 * 包装分支）；前端消费本 schema 解包 `data`，服务端出线不过本校验（信封面归拦截器职责）。
 * 切片 C 实机闭环实跑撞出本层缺席后补位（e2e 直调 service 不覆信封面）。
 */
export const odooApiSuccessWireSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    data,
    statusCode: z.number().int(),
    message: z.string(),
  });

/** 客户列表 wire 形（前端数据页消费）。 */
export const odooPartnersWireSchema = odooApiSuccessWireSchema(
  odooListEnvelopeSchema(odooPartnerViewSchema),
);
/** 商品列表 wire 形（前端数据页消费）。 */
export const odooProductsWireSchema = odooApiSuccessWireSchema(
  odooListEnvelopeSchema(odooProductViewSchema),
);
