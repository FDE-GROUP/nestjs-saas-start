# 测试类型纳入 CI 门禁（verify:test-types）

> 适用范围: `全局`（改 CI 门禁 = 高危·workflow §3）
> 关联: `specs/tooling-standards.md` §4.8（Local CI）· 承 module-posts-domain-entity-split / module-auth-* 测试面
> 性质: 增补型（新增一道硬门禁 + 两个 test-inclusive tsconfig，不改生产码/运行链）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

`build` 走 `tsconfig.build.json`（排 `*.test.ts`）、`vitest` transpile-only（esbuild/SWC）**不做类型检查** → 测试文件的类型错长期处于门禁盲区，只在手动 `tsc` 才现形。本轮即连撞两处真实回归：
- `posts-cursor-pagination.e2e.test.ts`：`Post.get id(): string | null`（FC 两阶段构造）push 进 `collected: string[]`（commit `368b64f`）。
- `auth.bootstrap.test.ts`：`AuthBootstrapService` 构造升为 6 参（新增 `mailerService`）测试只传 5（commit `c178b8e`）。

目标：新增 `pnpm run verify:test-types` 并把其纳入 full ci（随 pre-push 强制），覆盖**全部** vitest 测试面（apps/libs/packages/scripts·web 已由既有 Web typecheck 步覆盖），杜绝同类潜伏。

**非目标**：不改 `vitest` / `tsconfig.build` / 构建脚本；不给 `ci:quick` 加闸；不动已推送的 posts/payment/storage 生产码。

## 2. 方案

- **切片 A（配置+接线）** —— 完成判据：`pnpm run verify:test-types` exit 0。
  - 新增 `packages/api-client/tsconfig.test.json`：`extends ./tsconfig.json`（保 ESNext/Bundler），补回测试引用的 `@core`/`@saas` 路径别名（其自身配置把 `paths` 清空），`rootDir` 放宽至仓库公共祖先（跨包 `TS6059` 规避），`include: src/**/*.test.ts`（不再排测试）。
  - 新增 `scripts/tsconfig.json`：`extends ../tsconfig.json`（继承 `paths`/`types:["node"]`/node 解析），`include: **/*.test.ts`。
  - `package.json` 加 `verify:test-types`：链式 `tsc --noEmit -p` 过 `apps/api` + `libs/{core,contracts,mikro-adapter}`（各 `tsconfig.json` 已含测试）+ 上述两个新配置。
  - `scripts/ci.ts` full 段（`if (!quick)`）在 `Web typecheck` 之后、`Tests` 之前插入 `step('Test typecheck (all packages incl *.test.ts)', ...)`。
- **切片 B（登记）** —— 完成判据：`tooling-standards` §4.8 + 本索引行 + AGENTS §3 注记就位。

## 3. 影响面与风险

- **blast radius / 可逆性**：可逆（删脚本+步+两配置即回滚）。命中高危清单「改门禁/CI」→ 人签核（本方案经用户批准 = 签核）。
- **耗时**：full ci 增 ~6 次 `tsc`（apps/api 全量），预计 +1~2 分钟，仅 pre-push / `pnpm run ci` 承担；quick 不受影响。
- **基线**：落地前实测 api/libs/scripts/api-client 测试均 0 error（探针 + `--noEmit` 双验），起点即绿，不引入存量红。

## 4. 审计记录

- 结论：范围=追平 vitest 全测面；接入位置=仅 full ci（pre-push）；机制=逐包复用 tsconfig + packages/scripts 两 test-inclusive 配置。
- 未决项：无。
- 审计人 / 日期：用户批准（CreatePlan）/ 2026-10-21。

## 5. 完成判据（可核验 + 穷尽）

- [x] `pnpm run verify:test-types` exit 0。
- [ ] `pnpm run ci`（full）Local CI PASSED，新步位于 web 与 test 之间且绿。
- [ ] 负测：临时回退 `auth.bootstrap.test.ts` 第 6 参为 5 → `verify:test-types` 即刻红（验后恢复）。
- [ ] `tooling-standards` §4.8 登记 + 本索引行 + AGENTS §3 注记。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-21 | 0.1.0 | 起草（本轮 posts/auth 盲区驱动） | 首版 |

---

<!-- 变更戳 -->
正文已于 2026-10-21 / v0.1.0 变更，以当前正文内容为准。
