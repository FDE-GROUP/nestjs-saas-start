import { BaseQuery } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { UserDataExportReadModel } from '../read-models/user-data-export.read-model';

/**
 * PIPL 右-access（C1 · FR-7）：导出指定用户全部个人数据的 CQRS 查询。
 *
 * @remarks
 * PIPL right-to-access: aggregate all personal data related to the given user
 * into a single portable JSON payload (C1 · FR-7).
 * @public
 */
export class ExportUserDataQuery extends BaseQuery<UserDataExportReadModel> {
  constructor(readonly userId: string) {
    super();
  }
}
