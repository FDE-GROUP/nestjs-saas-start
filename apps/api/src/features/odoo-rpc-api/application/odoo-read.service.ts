import { canUseOdoo } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';
import {
  ORGANIZATION_ODOO_BINDING_READER,
  type OrganizationOdooBindingReader,
} from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding-reader';
import { ERROR_CODES } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { TenantIsolationService } from '@core/saas-kit/tenant-isolation/tenant-isolation.service';
import { BadGatewayException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  type OdooPartnerList,
  type OdooProductList,
  odooPartnerViewSchema,
  odooProductViewSchema,
} from '../api/odoo-rpc.schemas';
import { OdooJsonClient, type OdooRow } from '../infrastructure/odoo-json.client';

/**
 * Odoo 只读用例（反透传红线：模型/域/字段白名单全部硬编码于此，HTTP 面不存在
 * 「任意 model 任意域」的透传通道——见 module-odoo-rpc-frontend §5-B）。
 *
 * company 域强制注入（module-org-odoo-company-mapping 切片 B）：读用例 domain 统一经
 * {@link scopedCompanyDomain} 拼 `['company_id','=',cid]`，`cid` 由会话活动租户 → 绑定解析
 * （ALS 可信源，客户端**永不**传公司 id——反透传红线延伸）；无活动租户/无绑定/非 ready/
 * 非 active 一律 403 fail-closed（`canUseOdoo` 单源裁决·拒答码 ORG:ODOO_BINDING_NOT_READY）。
 * 再附 `allowed_company_ids` 上下文（纵深：Odoo 侧 ir.rule 同步收窄）。
 *
 * 防御面：上游行先归一（Odoo 对缺失值返回 False），再经视图 zod schema `parse`——
 * 上游模式漂移（字段改名/类型变化）当场 502，而不是把畸形数据静默透传给前端。
 */
@Injectable()
export class OdooReadService {
  constructor(
    @Inject(OdooJsonClient) private readonly client: OdooJsonClient,
    // S9 教训：非 controller provider 显式 @Inject；类 token 直注，Symbol 端口另注。
    @Inject(TenantIsolationService) private readonly tenant: TenantIsolationService,
    @Inject(ORGANIZATION_ODOO_BINDING_READER)
    private readonly bindings: OrganizationOdooBindingReader,
  ) {}

  /** 客户列表（res.partner·customer_rank>0∧本公司·字段白名单 name/email）。 */
  async listPartners(limit: number): Promise<OdooPartnerList> {
    const cid = await this.resolveReadyCompanyId();
    const domain = scopedCompanyDomain([['customer_rank', '>', 0]], cid);
    const context = companyContext(cid);
    const [rows, total] = await Promise.all([
      this.client.searchRead('res.partner', domain, ['name', 'email'], limit, context),
      this.client.searchCount('res.partner', domain, context),
    ]);
    return {
      items: rows.map((row) =>
        odooPartnerViewSchema.parse({
          id: row.id,
          name: textOf(row, 'name'),
          email: nullableTextOf(row, 'email'),
        }),
      ),
      total,
      limit,
    };
  }

  /** 商品列表（product.template·sale_ok=true∧本公司·字段白名单 name/list_price）。 */
  async listProducts(limit: number): Promise<OdooProductList> {
    const cid = await this.resolveReadyCompanyId();
    const domain = scopedCompanyDomain([['sale_ok', '=', true]], cid);
    const context = companyContext(cid);
    const [rows, total] = await Promise.all([
      this.client.searchRead('product.template', domain, ['name', 'list_price'], limit, context),
      this.client.searchCount('product.template', domain, context),
    ]);
    return {
      items: rows.map((row) =>
        odooProductViewSchema.parse({
          id: row.id,
          name: textOf(row, 'name'),
          listPrice: numberOf(row, 'list_price'),
        }),
      ),
      total,
      limit,
    };
  }

  /**
   * 会话租户 → 就绪公司 id（fail-closed 单点）：ALS 无活动租户 403（guard 机制层已拦，
   * 此为数据层二道）；绑定缺席/未绑定/非 ready/非 active 均 403·同一拒答码。
   */
  private async resolveReadyCompanyId(): Promise<number> {
    const organizationId = this.tenant.requireActiveOrganizationId();
    const binding = await this.bindings.read(organizationId);
    // 显式转形喂 canUseOdoo：reader 行的治理态字段名是 `organizationStatus`，而裁决入参
    // 读 `status`——直传整行会因字段名错位使 `status` 恒 undefined（视同 active），
    // 令 suspended/deleted 租户携 ready 绑定漏检。此处对齐字段，fail-closed 才完整。
    if (
      !binding ||
      !canUseOdoo({
        status: binding.organizationStatus,
        odooBindingStatus: binding.odooBindingStatus,
        odooCompanyId: binding.odooCompanyId,
      })
    ) {
      throw new ForbiddenException('Odoo 能力未就绪（租户无绑定或绑定非 ready）', {
        errorCode: ERROR_CODES.ORG_ODOO_BINDING_NOT_READY,
      });
    }
    // canUseOdoo 已担保 number 型；ts 窄化靠此断言（双条件不可互代偿的静态回声）。
    return binding.odooCompanyId as number;
  }
}

/** domain 单点注入器：基线白名单域 + 公司域 term（切片 B 泄露矩阵锁死不可绕过）。 */
function scopedCompanyDomain(base: unknown[][], companyId: number): unknown[] {
  return [...base, ['company_id', '=', companyId]];
}

/** 公司上下文（纵深防御：Odoo 侧 ir.rule 按 allowed_company_ids 同步收窄）。 */
function companyContext(companyId: number): Record<string, unknown> {
  return { allowed_company_ids: [companyId] };
}

/** Odoo 缺失值归一：False/undefined → 空串（name 在模型上必填，缺失即模式漂移信号）。 */
function textOf(row: OdooRow, field: string): string {
  const v = row[field];
  if (typeof v !== 'string') throw new BadGatewayException(`Odoo 上游字段 ${field} 非文本`);
  return v;
}

/** 文本或 null（可空字段：False → null）。 */
function nullableTextOf(row: OdooRow, field: string): string | null {
  const v = row[field];
  if (v === false || v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new BadGatewayException(`Odoo 上游字段 ${field} 非文本`);
  return v;
}

/** 数值或默认 0（list_price 等 float 字段缺失值 False → 0）。 */
function numberOf(row: OdooRow, field: string, whenMissing = 0): number {
  const v = row[field];
  if (v === false || v === undefined || v === null) return whenMissing;
  if (typeof v !== 'number') throw new BadGatewayException(`Odoo 上游字段 ${field} 非数值`);
  return v;
}
