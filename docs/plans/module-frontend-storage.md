# 前端 F5 · Storage 消费面（上传 · 签名 URL · 删除）

> 适用范围: `模块(apps/web)`（纯前端增量·后端/契约/OpenAPI 零触动）
> 关联: `global-frontend-adoption` §2.2（F2 后续消费面串行） · vision §4 第 7 支柱（人的界面） · tooling §4.12（前端反代同源）
> 性质: 重写型（当前方案整体重写 + 变更戳 + 演变单列）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

前端引入片（F0–F4 + B1）收口后，本窗消费缺口盘点（openapi 43 路径 vs apps/web 52 引用）拓出：`/api/v1/storage` 三 op（upload / `{key}` delete / `{key}` url）后端 **S3/AliOSS/腾讯COS provider 全实装且 OpenAPI 全 typed**，而前端**零消费**——是仅存「后端 functional 而前端未建」的用户级功能域（`/payment/*` 需真 PSP 键不可 demo·`/health` 属基础设施非用户面·二者缓）。

**目标**：`apps/web` 增一用户级文件存储消费面——上传单文件、展示结果、按 key 取签名 URL / 删除。

**非目标**：不做文件列表（后端**无 LIST op**·对象存储无状态可枚举）；不做多文件/批量；不引 react-query（承既有 loader+useAction 裸调惯例）；**不改后端 / 契约 / openapi 制品**；不含前端容器化部署（另片）。

## 2. 方案（单片穿透）

`/settings/storage` 页（`StorageController` 类级 `@TenantExempt` → 仅需会话、无需 active 租户）：

- **上传 widget**：裸 `<input type="file">` → 组 `FormData` → `api.POST('/api/v1/storage/upload', { body: fd })` → 成功回填 `FileUploadResultDto`。
- **当前件结果面板**（导出纯展示 `UploadResultPanel` 供测）：列 originalname / key / size / mimetype / 访问 URL + 签名 URL。
- **手动 key 操作框**：输入既有 key → 「取签名 URL」`api.GET('/api/v1/storage/{key}/url')` / 「删除」`api.DELETE('/api/v1/storage/{key}')`（成功清面板）。
- 复用现成基元：`useAction`（mutation + invalidate + describeApiError/logApiError）、`SectionHeading/EmptyPanel/ErrorPanel`、`SubmitButton/DangerButton/Feedback/Field/FormWrap`；`__root` 导航加「存储」项；`routeTree.gen.ts` 经 `pnpm run build:web`（router-plugin）重生。

**完成判据**：`pnpm run ci`（L1）全绿（web typecheck + jsdom 测）；**端到端 upload 真跑需真 S3/MinIO 凭据**（`.env` 现为占位符）→ 同他片归人类 dev 反代真跑验收。

**待裁点裁定**（用户择向 A 后令「你自行裁定」→ 授权代裁·**整体同意非逐条亲裁**·诚实标注）：

- **① 路由位置** = `/settings/storage`（用户级·邻 `/settings/account`）。
- **② 上传前置校验** = **不重复**体积/MIME 限制——`STORAGE_MAX_FILE_SIZE`/`ALLOWED_MIME_TYPES` 属后端 config 单源，前端不硬编造二源；仅 POST 后 surface 后端 `STORAGE_*`（`NO_FILE`/`FILE_TOO_LARGE`/`FILE_TYPE_NOT_ALLOWED`/`UPLOAD_FAILED`）errorCode 文案（已 wired 经 `describeApiError`）。仅做「未选文件」这一零知识本地守卫。
- **③ 手动 key 操作框** = **加**（无 list·否则历史上传件不可达）。
- **④ FormData typed 窄化** = `body: fd as never` + 注释——openapi-typescript 把 `format: binary` 映射为 `file?: string`，openapi-fetch 运行期识别 `FormData` 直传、TS 形不合需窄化（既有张力·无更净替代）。`expiresIn` UI **缓采**（用后端缺省签名时效）。
- **⑤ 测试深度** = jsdom 仅测**纯展示 `UploadResultPanel`**（typed fixture）——承「openapi-fetch 相对 URL 在 jsdom `new Request` 抛错、组件测须走纯展示」既有约束；交互上传/删除流归真机 dev 反代。

## 3. 影响面与风险

- **blast radius / 可逆性**：`apps/web` 内增量——新增 2 文件（页 + 测）+ 改 `__root.tsx` 导航 + `routeTree.gen.ts` 重生。**不命中 `workflow.md` §3 高危清单**（无 DB 迁移 / 无删依赖删码 / 无改门禁·CI / 无改公共契约 / 无 DI 形态变更）；后端、`@saas/contracts`、`openapi.yaml`、`schema.d.ts` 制品**零触动**。完全可逆（删页 + 还原 `__root`/`routeTree` 即净）。
- **主要风险**：真实 upload 依赖可达 S3 兼容端点（MinIO/AliOSS/COS/S3 + 凭据），占位符 env 下不可端到端；故本片自动化只到 L1 类型/纯展示测，传输正确性归人类验收（承全局前端片「dev 反代真跑待下环」同构处置）。

## 4. 审计记录

- 结论：用户择向 **A**（storage 消费面·前端主线）+ 令「你自行裁定」→ 待裁点①–⑤ 授权代裁（全采推荐档·见 §2）→ **GO**（纯前端增量·非高危·后端/契约零改动）。
- 未决项：端到端 upload/delete/get-url 真跑归人类（需 S3/MinIO 凭据·待下环）。
- 审计人 / 日期：用户择向 + 授权代裁 / 2026-10-22。

## 5. 完成判据（可核验 + 穷尽）

- [x] `apps/web/src/routes/settings.storage.tsx`（Route + 纯展示 `UploadResultPanel` 导出·落地 commit `9211ab3`）
- [x] `apps/web/src/routes/settings.storage.test.tsx`（typed `FileUploadResultDto` fixture 纯展示锁测·jsdom·2 例）
- [x] `__root.tsx` 导航增「存储」·`routeTree.gen.ts` 经 vite router 插件权威重生（顺带剔除 IDE 扩展误注入的 `/settings/storage/test` 桩路由）
- [x] 后端 / `@saas/contracts` / `openapi.yaml` / `schema.d.ts` 零改动（git status 坐实）
- [x] `pnpm run ci` L1 全绿（web typecheck 净·882 passed·fallow 无违界）
- [ ] dev 反代真跑 upload→get-url→delete 端到端（**归人·待下环**·需真 S3/MinIO 凭据）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-22 | 0.1.0 | 前端主线择向 A·授权代裁 | 首版：缺口盘点点名 storage 唯一未建域 + 单片方案 + 五待裁点代裁 |
| 2026-10-22 | 0.2.0 | 落地实施 | 页 + 测 + 导航 + routeTree 重生（`9211ab3`）·ci L1 882 绿·后端/契约零改动·dev 真跑归人；踩坑登记：IDE Router 扩展向新建 `settings.storage.tsx`/`.test.tsx` 注入 `Hello` 桩并把 `/settings/storage/test` 塞进 routeTree·剥桩后以 `vite build` 权威重生纠正 |

---

<!-- 变更戳 -->
正文已于 2026-10-22 / v0.2.0 落地（§5 自动化判据全绿·端到端真跑归人）；后续验收 / 变更随下窗回写 §5/§6。
