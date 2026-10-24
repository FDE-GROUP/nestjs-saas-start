/**
 * 客户开通端口的 DI 注入 token（global-tenancy §9.5.4①B/④ · P1c 支付端口）。
 *
 * @remarks
 * 订阅领域切片（domain+application 入 core·④）在「开通/改档」时需建立 tenant↔customer 映射，
 * 但**不得** import 应用侧具体 `PaymentService`。application 只消费本端口，实际通道
 * （Stripe/支付宝/微信·`PaymentService.createCustomer`）由参考应用侧适配提供。
 *
 * @public
 */
export const CUSTOMER_PROVISIONER = Symbol('CUSTOMER_PROVISIONER');

/**
 * 开通后的供应侧客户引用（仅标量·跨包安全·不透出 Payment SDK 类型）。
 *
 * @public
 */
export interface ProvisionedCustomer {
  /** 新建客户在支付提供方侧 id。 */
  readonly id: string;
  /** 支付/账号提供方标识。 */
  readonly providerId: string;
}

/**
 * 客户开通端口：建立/获取供应侧客户映射。
 *
 * @public
 */
export interface CustomerProvisioner {
  /**
   * 建立/获取指定 email 的供应侧客户；无可用通道时适配侧抛 503（NFR-2 未配即降级）。
   *
   * @param email - 待开通客户的邮箱
   * @returns 供应侧客户引用（id + providerId）
   */
  provisionCustomer(email: string): Promise<ProvisionedCustomer>;
}
