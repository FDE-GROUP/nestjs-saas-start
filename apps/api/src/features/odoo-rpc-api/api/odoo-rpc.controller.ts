import { Controller, Inject } from '@nestjs/common';
import { Impl } from '@orpc/nest';
import { openapi } from '@orpc/openapi';
import { oc, os } from '../../../common/orpc/orpc';
import { OdooReadService } from '../application/odoo-read.service';
import {
  odooListEnvelopeSchema,
  odooListQuerySchema,
  odooPartnerViewSchema,
  odooProductViewSchema,
} from './odoo-rpc.schemas';

/**
 * Odoo 只读数据面 HTTP 端点（GET /api/v1/odoo/{partners,products}）。
 *
 * 会话墙：全局 `APP_GUARD` 的 SessionGuard 已覆盖本路由（deny-by-default），feature
 * 无需 import auth 上下文——这是「严格叠加·零耦合」的落点。反透传红线：仅类型化
 * 只读端点，模型/字段白名单硬编码于 `OdooReadService`。
 *
 * 换轨 WP-C：两条只读路由转 per-method `@Impl`（薄壳委托既有 `OdooReadService`·零逻辑第二套判据）。
 * 契约单源仍居 feature 侧 `odoo-rpc.schemas.ts`（tooling-standards §3「feature 叠加层契约例外」·
 * 不入 `@saas/contracts`）——前端 `apps/odoo-rpc-web` 经 vite alias 直指该单源。旧 `@ApiExcludeController`
 * 退出公共 openapi 的取舍随 WP-F 退役 openapi:drift 而消解（生成态文档面不再入闸）。
 *
 * 租户墙（切片 B 翻转）：本面按**会话活动租户**的绑定域读（module-org-odoo-company-mapping §2.2），
 * 无活动租户经全局 TenantIsolationGuard 403 fail-closed；绑定非 ready 另经
 * `OdooReadService` 二道拒答（ORG:ODOO_BINDING_NOT_READY）。
 */
const odooPartnersMeta = openapi({
  method: 'GET',
  path: '/partners',
  summary: 'Odoo 客户列表（只读·字段白名单）',
});
const odooProductsMeta = openapi({
  method: 'GET',
  path: '/products',
  summary: 'Odoo 商品模板列表（只读·字段白名单）',
});

export const odooPartnersContract = oc
  .input(odooListQuerySchema)
  .output(odooListEnvelopeSchema(odooPartnerViewSchema))
  .meta(odooPartnersMeta);
export const odooProductsContract = oc
  .input(odooListQuerySchema)
  .output(odooListEnvelopeSchema(odooProductViewSchema))
  .meta(odooProductsMeta);

@Controller('odoo')
export class OdooRpcController {
  constructor(@Inject(OdooReadService) private readonly readService: OdooReadService) {}

  /** 客户列表（res.partner 白名单视图）。 */
  @Impl(odooPartnersContract)
  listPartners() {
    return os
      .input(odooListQuerySchema)
      .output(odooListEnvelopeSchema(odooPartnerViewSchema))
      .meta(odooPartnersMeta)
      .handler(({ input }) => this.readService.listPartners(input.limit));
  }

  /** 商品列表（product.template 白名单视图）。 */
  @Impl(odooProductsContract)
  listProducts() {
    return os
      .input(odooListQuerySchema)
      .output(odooListEnvelopeSchema(odooProductViewSchema))
      .meta(odooProductsMeta)
      .handler(({ input }) => this.readService.listProducts(input.limit));
  }
}
