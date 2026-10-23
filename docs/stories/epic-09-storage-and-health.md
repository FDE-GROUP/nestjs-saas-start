# Epic 09 · 支撑面：对象存储与存活探针

> 旅程: 用户如何上传/取回文件、平台如何暴露存活探针供编排 | 上下文: `storage`（对象存储·用户级）+ `health`（存活探针·公开）
> storage 属**用户级**（上传/下载·不经租户仓储 `requireActiveOrganizationId`）→ 类级 `@TenantIsolationExempt`（仍靠会话墙）。health 是 Dockerfile `HEALTHCHECK` 声明的探针端点，类级 `@Public()`（旁路会话+租户墙）+ `@SkipThrottle()`（探活/CI 不得被限流锁）。
> **provider 选型属实（与支付面对照）**：`S3` / `AliOSS` / `TencentCOS` **三 provider 均真实实现**（非仅类型占位）；`StorageService` 按 `storageConfig.provider` 命中已注册则用之，否则**回落 S3 作默认**——与 [Epic 06](./epic-06-billing-subscriptions-payment.md) 支付面「仅 Stripe 落地」不同，此处“三通道选型”为现状非规划。
> 版本: 0.3.0（2026-10-20·9.1 出口链据 `module-storage-upload-error-surface` 甲档收口翻正）

---

### 9.1 上传单个文件
- **作为** 已登录用户，**我想** 上传一个文件到对象存储，**以便** 存储二进制资源。
- **验收**：Given `multipart/form-data` 请求，When `POST /storage/upload`，Then 经 Fastify multipart 取流并交 `StorageService.uploadMultipartFile` 落存储返回结果（201）。**错误出口链**（`module-storage-upload-error-surface` 甲档收口后·各码于 HTTP 面正确显形）：非 multipart → 400 `STORAGE_NOT_MULTIPART`（抛于 try 前）；multipart 无文件 → 400 `STORAGE_NO_FILE`；文件超大小/类型非法 → 400 `STORAGE_FILE_TOO_LARGE`/`STORAGE_FILE_TYPE_NOT_ALLOWED`（service 校验·经末行 `await` 落回 catch 后按 `instanceof HttpException` 原样透传）；仅真未知/流层异常 → 400 `STORAGE_UPLOAD_FAILED`（catch 兜底归一）。
- **溯源**：`POST /api/v1/storage/upload` · `StorageController.uploadFile`（`req.isMultipart()`/`req.file()`·末行 `await uploadMultipartFile` + catch `instanceof HttpException` 放行）· `StorageService.uploadMultipartFile`/`validateFile` · 契约 `fileUploadResultSchema` · 关联 [`module-storage-upload-error-surface`](../plans/module-storage-upload-error-surface.md)（错误出口链甲档收口）/ [`global-cn-adaptation`](../plans/global-cn-adaptation.md)（OSS/COS/S3 provider 选型）。

### 9.2 删除文件
- **作为** 已登录用户，**我想** 按 key 删除一个文件，**以便** 清理存储对象。
- **验收**：Given 有效会话 + key，When `DELETE /storage/:key`，Then 返回 `{success}`。
- **溯源**：`DELETE /api/v1/storage/:key` · `StorageController.deleteFile` · `StorageService.deleteFile` · 契约 `storageDeleteSchema`。

### 9.3 获取文件签名 URL
- **作为** 已登录用户，**我想** 取某文件的临时签名 URL，**以便** 受控下载/展示。
- **验收**：Given key 存在，When `GET /storage/:key/url?expiresIn=`（秒·可选），Then 返回 `{url}`（限时签名）。
- **溯源**：`GET /api/v1/storage/:key/url` · `StorageController.getFileUrl` · `StorageService.getFileUrl(key, expiresIn)` · 契约 `storageUrlSchema`/`storageExpiresInQuerySchema`。

### 9.4 存活探针（ping-only）
- **作为** 编排系统（Docker/K8s），**我想** 探测服务是否存活，**以便** 判定容器健康、CI 验收真起服。
- **验收**：Given 无会话（公网），When `GET /api/v1/health`，Then 200 `{status:'ok'}`（最小指纹·无版本/uptime/环境）；Given 高频探测，Then 不被限流（`@SkipThrottle`）。
- **溯源**：`GET /api/v1/health` · `HealthController.check`（terminus `check([])`=ping 等价物）· `@Public()`（蕴含无会话=无租户）· 关联 [`module-common-health-probe`](../plans/module-common-health-probe.md)（Dockerfile HEALTHCHECK SSOT·readiness 缓行）。

---

← [故事索引](./README.md)

<!-- 变更戳 -->
正文 v0.1.0（2026-10-20）依当前代码逐路由取证成文；v0.2.0（2026-10-20）经逐条对照代码讨论：4 条逐条对拍均命中（无 overclaim·S3/AliOSS/TencentCOS 三 provider 均真实实现）；仅轻增补——header 补 provider 选择回落 S3 与“三通道属实、对照支付面”；9.1 补第三条 400 路径（provider/流异常 catch 兜底）。
