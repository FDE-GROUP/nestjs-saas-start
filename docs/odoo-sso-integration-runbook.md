# Odoo SSO 真链路联调 Runbook

> **状态**：待运维/联调人执行·本文件为结项证据存照口径指引（非自动链）  
> **前置**：五切片 A–E 全落地·`tmp/sso-commit.sh` 五片提交完成  
> **依赖**：[方案 §3 Odoo 侧配置清单](./plans/oauth-sso-odoo-integration.md)  
> **日期**：2026-10-24

---

## 1. 本机实态取证（联调前核实）

| 服务 | 端口/可达 | 来源 |
|------|-----------|------|
| NestJS API（本仓） | `http://localhost:7009/api/v1/*` | `pnpm run start:dev` |
| Odoo Web（OdooThink_20） | `http://localhost:8081` | nginx proxy → odoo-1:8069 |
| Odoo DB | 容器内 `5432`（不对外暴露） | pgvector/pgvector:pg16 |

**关键缺项**：Odoo 容器未配 `host.docker.internal`（Linux 宿主机须显式加）。修复：
```yaml
# odoothink-20/docker-compose.yml → odoo service
extra_hosts:
  - "host.docker.internal:host-gateway"
```
改完 `docker compose up -d odoo`。

---

## 2. 网络双重视角（浏览器 vs 容器内）

| 端点 | 谁调用 | 必须可达地址 | 说明 |
|------|--------|--------------|------|
| `/api/v1/oauth2/authorize` | **浏览器**（302 重定向） | `http://localhost:7009/api/v1/oauth2/authorize` | 操作者须先登录我方 SaaS·同端口/同 localhost·Cookie SameSite=Lax 随顶层 GET 导航发送 |
| `/api/v1/oauth2/userinfo` | **Odoo 服务端**（Bearer 回源） | `http://host.docker.internal:7009/api/v1/oauth2/userinfo` | 容器内不可用 localhost（须加 extra_hosts 或使用 docker bridge GW IP） |
| Odoo redirect callback | **浏览器**（302 后 fragment） | `http://localhost:8081/oauth2/callback` | JS 按 `window.location.origin + /oauth2/callback` 拼接 |

---

## 3. 我方侧配置（`SSO_OAUTH_CLIENTS`）

编辑 `.env`（或启动前 export）：
```bash
SSO_OAUTH_CLIENTS='[
  {
    "clientId": "odoo-prod",
    "redirectUris": ["http://localhost:8081/oauth2/callback"],
    "audience": "odoo-instance-1"
  }
]'
JWT_SECRET='dev-secret-change-in-prod'
```
- `redirectUris` **精确匹配** Odoo JS 拼出的 URL（含 scheme/host/port/path）。web.base.url 不同则同步改。
- 启动 `pnpm run start:dev`（API :7009）·确认日志无 fail-loud（config 解析 `SSO_OAUTH_CLIENTS` 合法）。

---

## 4. Odoo 侧配置（纯 UI·零代码）

1. **确保模块**：设置 → 应用 → 搜索 `auth_oauth` → 安装（依赖 `auth_signup`·通常已预装）。
2. **系统参数**：设置 → 技术设置 → 系统参数（`ir.config_parameter`）→ 新建：
   - `auth_oauth.authorization_header` = `1`  
     （使服务端以 `Authorization: Bearer <token>` 打 userinfo·而非 query 参数拼接——**必配**·对齐我方切片 D）
3. **OAuth Provider**：设置 → 技术设置 → 外部 OAuth 提供商 → 新建：

   | 字段（Odoo 20 实名） | 必填 | 值 |
   |------|:--:|----|
   | Provider name (`name`) | ✓ | `SaaS SSO` |
   | Client ID (`client_id`) | — | `odoo-prod` |
   | Authorization URL (`auth_endpoint`) | ✓ | `http://localhost:7009/api/v1/oauth2/authorize` |
   | UserInfo URL (`validation_endpoint`) | ✓ | `http://host.docker.internal:7009/api/v1/oauth2/userinfo` |
   | Scope (`scope`) | 默认 | `openid profile email`（默认即此值） |
   | Login button label (`body`) | ✓ | `使用 SaaS 登录`（登录页按钮文案·必填） |
   | Allowed (`enabled`) | — | ✓ 勾选 |
   | Data URL (`data_endpoint`) | 留空 | （设了会额外发一次取数请求·本方案不需要） |

   > **取证说明**（读自本机 `odoothink-20` 容器源码 `addons/auth_oauth/models/auth_oauth.py`）：Odoo 20 的 `auth.oauth.provider` **无** `client_secret` 字段、**无** code/token endpoint——隐式流不需要（Odoo JS 用 `response_type=token` 拿 fragment token 后直发 `/auth_oauth/signin`，不经过 token 交换端点）。

4. **Base URL 核实**：设置 → 技术设置 → 系统参数 → 确认 `web.base.url` = `http://localhost:8081`（影响 Odoo JS 拼出的 redirect_uri）。

---

## 5. 联调步骤与存照点

### 5.1 准备·浏览器登录 SaaS
- 打开 `http://localhost:5173`（dev 反代）或直接 API `http://localhost:7009/api/v1/auth/sign-in/email` 注册/登录。
- 确认：邮箱已验证（`emailVerified=true`·本端点硬门·未验证会 403）。
- 存照：`/api/v1/auth/get-session` 返回 200 + 用户信息（证明 cookie 会话活跃）。

### 5.2 Odoo 登录页 → 点击 SSO 按钮
- 新标签页（同浏览器·同 localhost·SameSite=Lax cookie 可达）打开 `http://localhost:8081/web/login`。
- 底部应出现 **"Sign in with SaaS SSO"** 按钮（来自 provider 配置）。
- 点击 → 浏览器顶层 GET 导航到 `http://localhost:7009/api/v1/oauth2/authorize?client_id=odoo-prod&redirect_uri=http%3A%2F%2Flocalhost%3A8081%2Foauth2%2Fcallback&response_type=token&scope=openid%20profile%20email&state=<random>`。

**存照 ①**：DevTools Network 面板截获该 GET 的 response：
- Status = **302**
- Location = `http://localhost:8081/oauth2/callback#access_token=eyJ...&token_type=Bearer&expires_in=120&state=<同请求>`

### 5.3 Odoo 服务端验证 token → 拿身份
- Odoo JS 从 fragment 提取 `access_token` → POST 到 `/auth_oauth/signin`。
- Odoo 服务端以 `Authorization: Bearer <token>` GET `http://host.docker.internal:7009/api/v1/oauth2/userinfo`。

**存照 ②**（可选·诊断）：从宿主机 curl 验证 userinfo 端点可达+形状正确：
```bash
TOKEN=<从存照① 拿到的 access_token>
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:7009/api/v1/oauth2/userinfo
# 期望：{"sub":"<user-id>","email":"<已验证邮箱>","name":"<显示名>"}
# 注意：裸 JSON·无 {data,statusCode} 信封包裹
```

### 5.4 Odoo 建/链会话
- Odoo 按 `email` 匹配/创建 `res.users` → 落 Odoo Session → 302 到 `/web`。
- 重定向至 Odoo 后台 → **登录成功**。

**存照 ③**（结项证据·核心断言）：
```bash
# 在已登录的 Odoo 浏览器中（取 Odoo session cookie）：
curl -s -b '<odoo_session_cookie>' -X POST http://localhost:8081/web/session/get_session_info \
  -H 'Content-Type: application/json' -d '{}' | jq '.result.user_context.uid'
# 期望：返回正整数 UID（非 error）→ 证明隐式流端到端通
```
或在浏览器 DevTools → Network → 观察 `/web/dataset/call_kw` 等后台调用 = Odoo 已认证。

---

## 6. 故障排查

| 现象 | 根因方向 | 修复 |
|------|----------|------|
| authorize 401 | 浏览器未登录 SaaS·cookie 缺 | 先登录 SaaS·确认 SameSite 发送（localhost 同 site·顶层 GET 不阻） |
| authorize 400 "unregistered" | SSO_OAUTH_CLIENTS 里 clientId 不匹配/未重启 | 核对 env + 重启 |
| authorize 400 "redirect not whitelist" | redirect_uri 精确对不上 | 确认 web.base.url + 路径 `/oauth2/callback` 完全一致（含 http/端口） |
| Odoo 报错 "Could not reach validation endpoint" | 容器内无 `host.docker.internal` | 加 extra_hosts 后 compose up |
| userinfo 401 "Invalid or expired" | token 超 120s TTL / 密钥不一致 | 快速操作 / 确认同一 JWT_SECRET 不飘 |
| userinfo 403 "email not verified" | SaaS 用户 emailVerified=false | 在 SaaS 库或注册流里置已验证 |
| userinfo 被 Odoo 判为“无主体” | 主体键未命中 | 无需担心——Odoo 20 `_auth_oauth_validate` 按 `sub`→`id`→`user_id` 优先取（源码实证·见 §7），本方返 `sub` 即命中标准键 |
| 登录后落回 Odoo 无权限/空白 | JIT 未开/邮箱无匹配用户 | 确认 `auth_signup` 安装·或预配 Odoo 侧同名邮箱用户 |

---

## 7. 主体键取证（已从「不确定」升为「源码实证·无需改动」）

> 取证来源：本机 `odoothink-20` 容器源码 `addons/auth_oauth/models/res_users.py`（`_auth_oauth_validate`）。本方案无需追加任何代码。

Odoo 20 `_auth_oauth_validate` 获取 userinfo JSON 后，按**优先级**统一 subject key：
```python
subject = next(filter(None, [validation.pop(k) for k in ['sub', 'id', 'user_id']]), None)
if not subject: raise AccessDenied('Missing subject identity')
validation['user_id'] = subject
```
即 **`sub`（OIDC 标准）· `id`（Google/Facebook）· `user_id` 三键任选·`sub` 最高优先**。
我方 userinfo 返 `{ sub, email, name }`：`sub` 命中标准键·`email`/`name` 由 `_generate_signup_values` 直读·**无需 `user_id` 别名**。

其余 Odoo 20 源码要点（同源文件取证）：
- `_auth_oauth_rpc`：`get_bool('auth_oauth.authorization_header')` 真 → 发 `Authorization: Bearer`（对齐我方切片 D）·假 → 拼 `?access_token=` query（我方未实现·**须开该参数**）。
- `_auth_oauth_validate`：若 `provider.data_endpoint` 非空会**额外发一次 RPC** 并合并入 validation——联调期**保持 data_endpoint 空**。
- 验签失败/拿到 `error` 键 → `raise` → AccessDenied 落回登录页·不建号。
- 建号走 `_generate_signup_values` + `self.signup(values, token)`（依赖 `auth_signup` 模块·JIT 白名单策略由 Odoo 侧配·与 plan 裁 ⓑ 一致）。

---

## 8. 边界声明

- **不承诺 SLO**（单点登出）：CE 无 backchannel logout·两侧会话各自过期。
- **隐式流弃用风险**：token 走 URL fragment·超短 TTL 收敛暴露面·长期演进位=丁档（另案）。
- **提交归人**：本 runbook 为操作指引·代码变更已落五切片 A–E·若 §7 触发改动需另出第六小片。
- **真库实跑 ≠ 本 runbook**：`oauth-sso.e2e.test.ts` 已证端点契约正确·本 runbook 是**跨系统真实联调验收**·非默认 CI 链。

---

## 9. 验收判据（结项证据清单）

- [ ] `web/login` 页面显示 SSO 登录按钮
- [ ] 点击后 302 Location 含 `access_token`·`expires_in=120`
- [ ] Odoo 成功调达 userinfo 并拿到 `{sub/email/name}`（Odoo 日志或 curl 存证）
- [ ] 重定向落 Odoo `/web`·session 活跃（`get_session_info` UID > 0）
- [ ] 二次访问 Odoo（同 session）无需再登（Odoo 侧会话持久·直到过期）
- [ ] 异常路径验证（无 SaaS 登录→401·token 过期→401·邮箱未验证→403）
