import { Inject, Injectable, Logger } from '@nestjs/common';
import { OdooJsonClient } from '../../odoo-rpc-api/infrastructure/odoo-json.client';
import type { OdooCompanyGateway } from './odoo-company-gateway';

/**
 * 建司网关的 JSON-RPC 适配实现（module-org-odoo-company-mapping 切片 C·写侧通道）。
 *
 * @remarks
 * 复用只读叠加层同款 `OdooJsonClient.executeKw` 的通用 RPC 面（`res.company` create/search_read 系 Odoo
 * 标准模型·低带宽），避免重造 JSON-RPC 管道。**诚实边界**：
 * - 凭证分离（方案 §2.3「写侧需 create/write scope」）本窗未落地——沿用读侧 `ODOO_*` 配置，真实开通须在
 *   联调窗以签发 write scope 的 API key 接线（`ODOO_*` 键位切换归部署面·人签后执行）；
 * - `applyLocalizationBaseline` / `provisionAdministrator` 触及 l10n 模块安装与 `res.users`/allowed_companies
 *   预配等**深水区**，其正确性只能在活体 Odoo 上对拍——本窗无联调栈，绝不臆造未验证的模块/模型调用，故显式
 *   落为「记录并跳过」的占位实现（打 warn 留痕），联调窗补实并把真建司 e2e 从门跳过转为常跑。
 * 换言之：本类的 `findCompanyIdByName`/`createCompany` 是可直接联调的真 RPC，后两者是带 fail-loud 日志的骨架占位。
 */
@Injectable()
export class OdooJsonCompanyGateway implements OdooCompanyGateway {
  private readonly logger = new Logger(OdooJsonCompanyGateway.name);

  // 铁律：被注入类值导入 + 显式 @Inject（类即 token）。
  constructor(@Inject(OdooJsonClient) private readonly client: OdooJsonClient) {}

  async findCompanyIdByName(name: string): Promise<number | null> {
    const rows = await this.client.searchRead('res.company', [['name', '=', name]], ['name'], 1);
    const hit = rows.find((row) => typeof row.id === 'number');
    return hit && typeof hit.id === 'number' ? hit.id : null;
  }

  async createCompany(name: string): Promise<number> {
    return this.client.executeKw<number>('res.company', 'create', [[{ name }]], {});
  }

  async applyLocalizationBaseline(companyId: number): Promise<void> {
    // 占位（见类头·诚实边界）：l10n 基线属活体对拍面，本窗不臆造。联调窗补实。
    this.logger.warn(`本地化基线跳过（骨架占位·待联调窗真跑对拍）：companyId=${companyId}`);
  }

  async provisionAdministrator(companyId: number): Promise<void> {
    // 占位（见类头·诚实边界）：管理员/allowed_companies 预配属活体对拍面，本窗不臆造。联调窗补实。
    this.logger.warn(`管理员预配跳过（骨架占位·待联调窗真跑对拍）：companyId=${companyId}`);
  }
}
