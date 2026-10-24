import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { OrganizationDataExport } from '../read-models/organization-data-export.read-model';

/**
 * 按租户导出全部名下数据查询（NFR-6·平台级读侧）；不存在 → null（404）。deleted 终态亦可导。
 * @public
 */
export class ExportOrganizationDataQuery extends BaseQuery<OrganizationDataExport | null> {
  constructor(readonly organizationId: string) {
    super();
  }
}
