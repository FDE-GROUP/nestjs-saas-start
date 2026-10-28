import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OdooReadService } from '../application/odoo-read.service';
import type { OdooListQuery, OdooPartnerList, OdooProductList } from './odoo-rpc.schemas';
import { odooListQuerySchema } from './odoo-rpc.schemas';

/**
 * Odoo 只读数据面 HTTP 端点（GET /api/v1/odoo/{partners,products}）。
 *
 * 会话墙：全局 `APP_GUARD` 的 SessionGuard 已覆盖本路由（deny-by-default），feature
 * 无需 import auth 上下文——这是「严格叠加·零耦合」的落点。反透传红线：仅类型化
 * 只读端点，模型/字段白名单硬编码于 `OdooReadService`。
 *
 * `@ApiExcludeController()`：整控制器退出公共 `openapi.yaml`（私有叠加层契约例外·
 * tooling-standards §3）——机制根源：codegen 运行期扫应用图，在场/缺席两态再生成
 * 必漂移、对拍闸一态必炸。前端类型经 vite alias 直指 `odoo-rpc.schemas.ts` 单源。
 *
 * 租户墙（切片 B 翻转）：原 `@TenantIsolationExempt()`（平台服务账号口径）已撤——
 * 本面现按**会话活动租户**的绑定域读（module-org-odoo-company-mapping §2.2），
 * 无活动租户经全局 TenantIsolationGuard 403 fail-closed；绑定非 ready 另经
 * `OdooReadService` 二道拒答（ORG:ODOO_BINDING_NOT_READY）。
 */
@ApiTags('odoo')
@ApiExcludeController()
@Controller('odoo')
export class OdooRpcController {
  constructor(@Inject(OdooReadService) private readonly readService: OdooReadService) {}

  /** 客户列表（res.partner 白名单视图）。 */
  @Get('partners')
  @ApiOperation({ summary: 'Odoo 客户列表（只读·字段白名单）' })
  listPartners(
    @Query({ schema: odooListQuerySchema }) query: OdooListQuery,
  ): Promise<OdooPartnerList> {
    return this.readService.listPartners(query.limit);
  }

  /** 商品列表（product.template 白名单视图）。 */
  @Get('products')
  @ApiOperation({ summary: 'Odoo 商品模板列表（只读·字段白名单）' })
  listProducts(
    @Query({ schema: odooListQuerySchema }) query: OdooListQuery,
  ): Promise<OdooProductList> {
    return this.readService.listProducts(query.limit);
  }
}
