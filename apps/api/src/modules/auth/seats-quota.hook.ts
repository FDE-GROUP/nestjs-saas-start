/**
 * S7 收尾 · BA 成员增量端点的 seats 配额 before-hook（vision §7 阶段 2 商业闭环合龙）。
 *
 * 事实依据（二轮 spike·plan v0.2）：BA 1.7.7 中成员增建的真实 HTTP 通道是
 * `invite-member`（仅发邀请·不写 member 行）→ `accept-invitation`（member 行落行时点·唯一卡点）；
 * `addMember` 为 server-only 不注册 HTTP 路由，teams 缺省未启用。 matcher 同时防御性预留
 * `add-member` / `add-team-member` 字面量（BA 若未来注册这些路由即自动覆盖，现网无路由不误伤）。
 *
 * 卡点语义：超限抛 402（Payment Required·语义=需升级档位）——消费 `QuotaService.checkSeats`
 * 判别结果后由本 hook 自行翻译（架构精度修宪 S2：core 不再抛 HTTP·assertSeats 已删·错误体口径不变）。hook 校验与实际插入间的并发窄口按 plan §4-丙接受为软性商业限制。
 * invitation 表查询为**读侧**（表所有权纪律条款②：读宽松·写卡 owner）。
 *
 * ORM 修宪案 B · 切片 3d（S-d3）：invitation 读由旧 ORM `select().from().where().limit()` 改走
 * **Mikro `em.findOne(Invitation,…,{fields})`**（仅改数据通道·不改裁决行为）。`fork()` 只在
 * **命中 matcher 的实际请求内**调用（插件构造时仅存 `mikro` 引用不建连）→ 保持 `app-boot.smoke`/
 * `verify:prod-boot` 的 DB-free 不变量。`QuotaService.checkSeats` 早在 3c-ii-A 即已走 Mikro（本片不动）。
 */

import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Invitation } from '@app/modules/tenants/infrastructure/entities/ba-org.entities';
import type { QuotaService } from '@core/saas-kit/modules/subscriptions/quota/quota.service';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';

/** 成员行数增加的端点面（accept-invitation 为现网唯一真实通道，余为防御预留）。 */
const MEMBERSHIP_INCREMENT_PATHS =
  /^\/organization\/(accept-invitation|add-member|add-team-member)$/;

export interface SeatsQuotaHookDeps {
  readonly quota: Pick<QuotaService, 'checkSeats'>;
  /** Mikro 连接持有者（懒建·仅 `fork()`·测试以 `{ fork }` 假象注入）。 */
  readonly mikro: Pick<MikroOrmService, 'fork'>;
}

/** 解析本次增量事件的目标租户；无法判定时返回 null（放行·交由 BA 自身校验拒绝畸形请求）。 */
async function resolveTargetOrg(
  ctx: MiddlewareCtx,
  deps: SeatsQuotaHookDeps,
): Promise<string | null> {
  const path = ctx.path ?? '';
  if (path === '/organization/accept-invitation') {
    const invitationId = (ctx.body as { invitationId?: string } | undefined)?.invitationId;
    if (!invitationId) return null;
    const em = await deps.mikro.fork();
    // 读侧宽松（表所有权②）：只取 organizationId/status 两列·invitation 属 tenants 上下文·本处仅读。
    const row = await em.findOne(Invitation, { id: invitationId } as never, {
      fields: ['organizationId', 'status'],
    });
    // 邀请不存在/已消费：放行让 BA 走自身错误路径（404/400），配额层不越权裁决
    if (!row || row.status !== 'pending') return null;
    return row.organizationId;
  }
  // 防御预留通道（现网无 HTTP 路由·仅取 body.organizationId）
  return (ctx.body as { organizationId?: string } | undefined)?.organizationId ?? null;
}

/** hook handler 的最小结构类型（BA MiddlewareInputContext 运行时实含 path/body，类型面未暴露）。 */
interface MiddlewareCtx {
  readonly path?: string;
  readonly body?: unknown;
}

/**
 * 构造 seats 配额插件（CreateAuth 装配点追加进 plugins）。
 * 形态根据：dispatch.mjs 运行时实读——顶层 `options.hooks.before` 是**单函数**（无条件跑），
 * `{matcher, handler}[]` 数组形态只存在于**插件级** hooks（经 plugins.flatMap 收集）；
 * 对齐同文件 `add-account-to-session` 插件先例。导出为纯函数便于单测，无需起 Nest 容器。
 */
export function createSeatsQuotaPlugin(deps: SeatsQuotaHookDeps): BetterAuthPlugin {
  return {
    id: 'seats-quota-guard',
    hooks: {
      before: [
        {
          matcher: (context) => MEMBERSHIP_INCREMENT_PATHS.test(context.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const organizationId = await resolveTargetOrg(ctx as MiddlewareCtx, deps);
            if (!organizationId) return;
            const verdict = await deps.quota.checkSeats(organizationId, 1);
            if (!verdict.ok) {
              throw new APIError(402, {
                message: `Seat quota exceeded: ${verdict.used}+1 > ${verdict.limit}`,
              });
            }
          }),
        },
      ],
    },
  };
}
