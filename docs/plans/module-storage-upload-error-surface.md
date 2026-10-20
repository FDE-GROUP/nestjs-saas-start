# storage upload 错误出口链收口（catch 吞并 + 未 await）

> 适用范围: `模块(storage)` ← 单 controller 方法错误处理·触对外 HTTP 400 码细分（响应契约面微调）
> 关联: `docs/plans/module-test-coverage-gaps.md` §4.1（发现源）· `docs/stories/epic-09-storage-and-health.md` 9.1 · `module-common-error-response-contract`
> 性质: 修复型（改实现·非纯文档）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

补测片（module-test-coverage-gaps G2）为 `StorageController.uploadFile` 写断言时，据实拓出**两处 as-built 实现瑕疵**（当时只锁现状未改码）：

- **① `STORAGE_NO_FILE` 被吞**：抛点（controller L89）在 `try`（L85 起）内、系**同步 throw** → 被 catch（L103）捕获后**重新包成 `STORAGE_UPLOAD_FAILED`**。故 HTTP 面永远看不到 `NO_FILE` 具体码，只剩 service 层内部持有。
- **② 未 await 致 catch 失效**：末行 `return this.storageService.uploadMultipartFile(...)` **未 await** → 该 promise 的 reject 发生在 `try` 已同步返回之后，**逃过 catch**。于是 service 抛出的 `FILE_TOO_LARGE`/`FILE_TYPE_NOT_ALLOWED`/service 自身 `UPLOAD_FAILED` **原样上抛保自身码**。

**净果**：同为「上传失败」，HTTP 面错误码语义**不一致**——service 校验码透传、no-file 被归一，catch 对主调用实际无效。

**目标**：统一 `uploadFile` 的错误出口策略，使**领域校验码正确透出**、`UPLOAD_FAILED` 只兜真正未知/流层错误，消除上述两处不一致。

**非目标**：不改 provider 选择逻辑（命中/回落 s3 维持）；不改 service 的 validateFile 语义；不动 zod 响应契约 schema；不涉其它端点。

## 2. 方案

仅重写 `uploadFile` 的 await/rethrow 形态。两种收口档**归人裁**：

- **甲（推荐）· 保留领域码、catch 只兜未知**：
  ```
  if (!req.isMultipart()) throw NOT_MULTIPART;      // 保持（try 前）
  const data = await req.file();
  if (!data) throw NO_FILE;                          // 移出 try 或 catch 内放行 BadRequest
  return await this.storageService.uploadMultipartFile(...);  // 补 await
  // catch (e) { if (e instanceof HttpException) throw e; throw UPLOAD_FAILED(兜未知/流) }
  ```
  效果：`NO_FILE`/`FILE_TOO_LARGE`/`FILE_TYPE_NOT_ALLOWED`/service 自身码**正确透出**；`UPLOAD_FAILED` 仅兜非 HttpException 的真未知错误。
- **乙 · 全归一 UPLOAD_FAILED**：catch 无条件包 `UPLOAD_FAILED`（放弃细分码）。最简，但丢失给客户端的错误语义（不推荐）。

**连带同步**（甲档）：
1. 调整 `storage.controller.test.ts` 断言——`NO_FILE` 转为 HTTP 面可观测（撤 §4.1「被吞」断言·改锁真实透出）；service 校验码经 await 后仍透出的路径复测。
2. 校正故事 9.1 措辞（三条 400 码由「service 层持有」翻正为「HTTP 面可观测」）。
3. `openapi.yaml` 若 `POST /storage/upload` 已列 400 响应码，跑 `openapi:drift` 对拍（错误细分不改 schema 外形·预期零漂移·据实核）。

## 3. 影响面与风险

- **blast radius / 可逆性**：单方法（`uploadFile`）+ 其单测 + 故事 9.1 措辞。可逆（改坏 revert 该方法）。
- **高危清单核对（workflow §3）**：不命中——无迁移 / 无删依赖 / 无改门禁·宪法·公共契约。**但改变对外 HTTP 400 错误码细分**（响应契约面微调）：属对外行为变化，须以实跑/测对拍为验收口径，不得凭「构建通过」判成。若判为「公共契约」范畴则升高危#2 归人签。
- **回滚**：revert 该 commit。

## 4. 审计记录

> 无已审方案不写码。

- 结论：**（待审计·归人）**
- 未决项：
  - ① 收口档取 **甲（推荐）** 还是乙？
  - ② 「改变对外 400 码细分」是否触发高危#2（契约）须显式签，还是视为错误处理内部修复随片自审？
- 审计人 / 日期：____

## 5. 完成判据（可核验 + 穷尽）

- [ ] `uploadFile` await/rethrow 形态按择定档收口·两处不一致消除
- [ ] `storage.controller.test.ts` 断言随真实行为更新（NO_FILE 可观测·service 校验码透出路径复测）
- [ ] 故事 9.1 措辞校正·与实现一致
- [ ] `pnpm run ci` 全绿（基线只增不减 · Biome 净 · fallow 0）+（如涉 openapi）`openapi:drift` 零漂移
- [ ] 零 schema / 零依赖 / 零门禁变更

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-20 | 0.1.0 | 起草 | 首版（承补测片 §4.1 发现立案·待审计·零实现） |

---

<!-- 变更戳 -->
正文已于 2026-10-20 / v0.1.0 起草（候选稿·零实现），状态以 README 索引表为单源。
