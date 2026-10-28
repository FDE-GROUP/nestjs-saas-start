import { Module } from '@nestjs/common';
import { OdooReadService } from '../application/odoo-read.service';
import { OdooJsonClient } from '../infrastructure/odoo-json.client';
import { OdooRpcController } from './odoo-rpc.controller';

/**
 * Odoo RPC 只读集成装配根（module-odoo-rpc-frontend 切片 B·反透传只读端点 + 原生 fetch 客户端）。
 *
 * 本叠件住本公共仓 `apps/api/src/features/odoo-rpc-api/`（开源边界重划 2026-10-28 后常驻追踪·非
 * 私有同步副本），由 `feature-loader.ts` 运行期探测装配（严格叠加·缺席态不绑架构建）。
 * 层形遵 architecture §features/ 专属区条：`{application, infrastructure, api}`、无 `domain/`。
 */
@Module({ controllers: [OdooRpcController], providers: [OdooJsonClient, OdooReadService] })
export class OdooRpcApiModule {}
