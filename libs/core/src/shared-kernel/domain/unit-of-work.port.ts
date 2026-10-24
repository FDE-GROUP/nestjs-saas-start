/**
 * Unit of Work 端口的 DI 注入 token（ES Phase B 后半 · module-es-outbox-transactional 切片 B，
 * 沿 S10 P1 / event-store.port 端口倒置先例：core 只声明契约，零 ORM/Nest 依赖）。
 *
 * @remarks
 * 立意：outbox 的硬要求是「域行与事件行**同事务原子写**」。发布点（治理服务/command handler）
 * 把关键段包入 `run`，实现侧（参考应用 ALS + MikroORM 事务）让事务内的所有仓储/事件写
 * 复用同一事务 em——core 不感知 ORM，也不感知发布模式。
 *
 * 约定：
 *  - `run` 可重入：外层已有活跃事务时直接执行 `fn`（复用外层，不嵌套 BEGIN）；
 *  - `fn` 内任何抛错 → 事务整体回滚（业务写与事件写同生共死，「宁缺勿错」）；
 *  - `inproc` 等无库写形态下由实现决定开销（本仓实现统一开短事务，语义等价仅提交时点收紧）。
 *
 * @public
 */
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

/**
 * 事务工作单元端口（把关键段包入同一事务）。
 *
 * @public
 */
export interface UnitOfWork {
  /**
   * 在单元事务内执行 `fn`（可重入·复用外层事务）。
   *
   * @param fn - 待包入事务的异步工作
   * @returns `fn` 的结果；`fn` 抛错则整体回滚
   */
  run<T>(fn: () => Promise<T>): Promise<T>;
}
