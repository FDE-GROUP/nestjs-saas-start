import { ORGANIZATION_ODOO_BINDING_STATUS } from '@core/saas-kit/modules/organizations/lifecycle/organization-odoo-binding';

/**
 * 租户↔Odoo 绑定两向对拍的**纯逻辑**（module-org-odoo-company-mapping 切片 C·doctor 的裁决核）。
 *
 * @remarks
 * 与 I/O 解耦（住独立文件·CLI 只负责取两侧事实喂入），故可脱离活体 Odoo/DB 单测逐格锁定——这正是骨架窗
 * 「可 DB/纯函数验证的核」+「联调窗真跑对拍的壳」的分界。两向语义遵 §1 单源裁决（公司必先有租户、后有建司）：
 * - **正向（悬空绑定·必报）**：SaaS 侧声明 `ready` 的公司 id，在 Odoo 侧已不存在 → 映射指向空壳，Odoo 能力
 *   fail-open 泄漏风险，属须人工介入的真漂移（doctor 以 exit 1 报出）；仅 `ready` 参与——`pending`/`provisioning`/
 *   `failed` 是「公司尚未/未稳」的正当中间态，不算悬空。
 * - **反向（孤儿公司·仅告警）**：Odoo 侧在册的（本方确定性命名的）公司已无任何 SaaS 绑定引用 → 低频审计项
 *   （§1「孤儿公司降为低频审计项」），不阻断（exit 0·只点名）。
 *
 * @public
 */

/** doctor 消费的最小绑定快照（SaaS 侧映射行子集·避免耦合 ORM 实体类型）。 */
export interface BindingSnapshot {
  /** 所属租户 id。 */
  organizationId: string;
  /** 绑定的 Odoo 公司 id（未绑定 null）。 */
  odooCompanyId: number | null;
  /** 绑定生命周期态（null=未绑定）。 */
  odooBindingStatus: string | null;
}

/** 悬空绑定条目（ready 却指向 Odoo 侧缺席的公司）。 */
export interface DanglingBinding {
  organizationId: string;
  odooCompanyId: number;
}

/** 两向对拍报告。 */
export interface BindingDriftReport {
  /** 正向：ready 但公司缺席（必报·非空即漂移）。 */
  danglingBindings: DanglingBinding[];
  /** 反向：Odoo 侧在册但无绑定引用（仅告警）。 */
  orphanCompanyIds: number[];
}

/**
 * 执行两向对拍（纯函数·无副作用）。
 * @param bindings - SaaS 侧绑定快照全集（含未绑定行·内部按字段筛）。
 * @param provisionedCompanyIds - Odoo 侧在册公司 id（调用方按确定性命名口径过滤后喂入·非全库裸取）。
 * @returns 悬空绑定 + 孤儿公司两类清单。
 * @public
 */
export function analyzeBindingDrift(
  bindings: readonly BindingSnapshot[],
  provisionedCompanyIds: Iterable<number>,
): BindingDriftReport {
  const liveCompanyIds = new Set(provisionedCompanyIds);
  // 被任意绑定引用的公司 id（不限状态——failed/provisioning 的引用仍算「已认领」，反向不该报孤儿）。
  const referencedCompanyIds = new Set<number>();

  const danglingBindings: DanglingBinding[] = [];
  for (const binding of bindings) {
    if (binding.odooCompanyId === null) continue;
    referencedCompanyIds.add(binding.odooCompanyId);
    // 正向仅对 ready 裁决：ready = 对 Odoo 能力放行的承诺，公司缺席即悬空。
    if (
      binding.odooBindingStatus === ORGANIZATION_ODOO_BINDING_STATUS.READY &&
      !liveCompanyIds.has(binding.odooCompanyId)
    ) {
      danglingBindings.push({
        organizationId: binding.organizationId,
        odooCompanyId: binding.odooCompanyId,
      });
    }
  }

  // 反向：在册公司中没有任何绑定引用者 = 孤儿（仅告警·按 id 升序稳定输出）。
  const orphanCompanyIds = [...liveCompanyIds]
    .filter((id) => !referencedCompanyIds.has(id))
    .sort((a, b) => a - b);

  return { danglingBindings, orphanCompanyIds };
}
