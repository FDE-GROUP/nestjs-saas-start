# Odoo SSO 真链路联调操作手册（Handbook）

> **状态**：待人工验证（本手册 = 可照做的操作清单 + 本会话已钉死的具体值）  
> **面向**：运维/联调人（需 Odoo 管理员权限 + 本机浏览器）  
> **上位文档**：方案 [oauth-sso-odoo-integration](../plans/oauth-sso-odoo-integration.md) · 联调指引 [odoo-sso-integration-runbook](../odoo-sso-integration-runbook.md)  
> **本手册定位**：runbook 的「手把手 · 已填具体值 · 含踩过的坑」操作版；两者冲突以 runbook 的结构化说明为准，本手册负责可点可跑的落地细节。  
> **日期**：2026-10-25

---

## 0. 当前进度快照（照做前先看）

| 项 | 状态 |
|----|------|
| 五切片代码 A–E | ✅ 已提交并推 `origin/main`（`66031e6→c150231`） |
| L1 门禁（本地 + pre-push） | ✅ 全绿·908 passed |
| 服务器侧 fail-closed smoke | ✅ 4/4（`tmp/sso-live-smoke.sh`） |
| `.env` 已配 `SSO_OAUTH_CLIENTS` + `ALLOWED_ORIGINS` | ✅ 本会话已改（本地生效·`.env` 不入库） |
| API 用新配置重启 | ⚠️ **须手动重启**（`.env` 改动不触发 `--watch`） |
| Odoo 侧 provider / 系统参数 / extra_hosts | ❌ **未配**（本手册 §2–§4 教你配） |
| 真 SSO 端到端（点按钮→落 /web→取 uid） | ⏳ 待验证 |
| `sso-evidence.sh` 已跑通取 `uid>0` | ✅ 已跑通，但**那次是 admin 密码登录**（`uid=2`），**非 SSO**——见 §5 坑 |

> ⚠️ 关键提醒：`sso-evidence.sh` 拿到 `uid>0` 只证明「会话活跃 + 取证管道通」，**不证明这个会话是 SSO 建立的**。务必按 §5 用「只有 SSO 能登」来证伪普通登录。

---

## 1. 本机会钉死的具体值（照抄即可）

```ini
# .env（本会话已写入·验证时确认仍在）
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:7009
SSO_OAUTH_CLIENTS='[{"clientId":"odoo-prod","redirectUris":["http://localhost:8081/oauth2/callback"],"audience":"odoo-instance-1"}]'
```

| 端点 / 参数 | 值 | 由谁调用 |
|------|----|----------|
| authorize（`auth_endpoint`） | `http://localhost:7009/api/v1/oauth2/authorize` | 浏览器 |
| userinfo（`validation_endpoint`） | `http://host.docker.internal:7009/api/v1/oauth2/userinfo` | Odoo 容器内 |
| client_id | `odoo-prod`（须与 `.env` 一字不差） | — |
| redirect_uri（Odoo JS 自动拼） | `http://localhost:8081/oauth2/callback` | 浏览器回调 |
| audience | `odoo-instance-1` | — |

---

## 2. 前提一：重启 API 吃新配置

```bash
# 若在跑：Ctrl+C 停旧进程（旧进程无 SSO_OAUTH_CLIENTS → authorize 会 400）
pnpm run start:dev
```
验证 OP 面已接线且受保护（可选·但推荐）：
```bash
bash tmp/sso-live-smoke.sh
# 期望：✅ live smoke 通过（4/4）
```

## 3. 前提二：给 Odoo 容器补宿主机解析（Linux 必须）

编辑 **odoothink-20/docker-compose.yml**（在 workspace 外·归你改），`odoo` 服务加：
```yaml
    extra_hosts:
      - "host.docker.internal:host-gateway"
```
然后：
```bash
docker compose up -d odoo
```
> 不加此项，Odoo 服务端调 `host.docker.internal:7009` 会连不通 → 登录页点按钮后 Odoo 报「无法访问 validation endpoint」。

## 4. 前提三：Odoo 里建 OAuth provider（管理员·纯 UI·零代码）

1. **开开发者模式**：设置(General Settings) → 拉到最底 **Developer Tools → Activate**（或地址栏尾加 `?debug=1`）。
2. **装模块**：应用(Apps) → 搜 `auth_oauth`（界面或显示为 "OAuth2" / "Authentication via OAuth2"）→ **Install**。
3. **建 provider**：设置 → 技术(Technical) → 外部 OAuth 提供商(External OAuth Providers) → **Create**：

   | 字段 | 填这个值 |
   |---|---|
   | Provider name | `SaaS SSO` |
   | Client ID | `odoo-prod` |
   | Authorization URL（`auth_endpoint`） | `http://localhost:7009/api/v1/oauth2/authorize` |
   | UserInfo URL（`validation_endpoint`） | `http://host.docker.internal:7009/api/v1/oauth2/userinfo` |
   | Scope | `openid profile email` |
   | Login button label（`body`） | `使用 SaaS 登录`（即按钮上的文字） |
   | Allowed（`enabled`） | ✅ 勾选 |
   | Data URL（`data_endpoint`） | **留空**（填了 Odoo 会多打一次取数请求） |

   > Odoo 20 的 `auth.oauth.provider` **没有** `client_secret`、**没有** token/code endpoint 字段（隐式流不经 token 交换）。菜单中文名各版本略有出入，找不到就在开发者模式左侧搜 "OAuth"。

4. **系统参数**（设置 → 技术 → 参数 / System Parameters）确保两条：
   - `auth_oauth.authorization_header` = `1` ← **必配**，否则 Odoo 用 `?access_token=` query 而非 `Authorization: Bearer`（我方只认 Bearer）
   - `web.base.url` = `http://localhost:8081` ← 决定 JS 拼出的 redirect_uri；须与 `.env` 白名单精确匹配

---

## 5. 验证 SSO 端到端（核心·注意区分普通登录）

### 5.1 准备：SaaS 侧登录态
- 浏览器开 `http://localhost:5173`，用**邮箱已验证**的账号登录 SaaS（新用户默认可能未验证 → userinfo 会 403，见 §6）。**保持这个浏览器登录态。**

### 5.2 证伪「普通登录」
先用 Odoo 账号密码能登进去（= 你已确认 admin 可用）。现在要证明 **SSO 独立可用**，必须**清掉密码会话**再走 SSO：

1. 退出 Odoo：开 `http://localhost:8081/web/session/destroy`（或右上角头像 → 退出）。
2. 打开 `http://localhost:8081/web/login` → **底部应出现「使用 SaaS 登录」按钮**（来自 §4 provider 的 `body`）。
3. **不输任何密码**，直接点该按钮 → 触发 `authorize(302 带 access_token fragment)` → Odoo `signin` → `userinfo(Bearer)` → 落回 Odoo `/web`。
4. 落回后 = **全程未用 Odoo 密码登录成功** = SSO 真生效。

### 5.3 取证脚本（`sso-evidence.sh`）
> ⚠️ **两个已踩过的坑**：
> 1. `<odoo session_id>` 里的**尖括号是占位符**，不能照抄——shell 会把 `<` 当重定向符报 `syntax error near unexpected token 'newline'`。
> 2. `abcdef1234567890...` 也只是**示意串**，不是真实会话；喂它会得 `user is not connected`（脚本据此判失败，属正常）。

正确做法：取**真实且活跃**的 `session_id`——
- F12 → Application → Cookies → `http://localhost:8081` → 复制 `session_id` 的 **Value 整串**（登录后会刷新，取当前这条）。
- 运行（把整串直接放参数位，**不带 `<>`、不带 `...`**）：
```bash
bash tmp/sso-evidence.sh <这里换成真实 session_id 值>
```
- 期望：`✅ 存照③ 通过 · uid=<SSO 映射的用户·非 admin 的 2>`。

### 5.4 结项判据（全勾才算 SSO 通过）
- [ ] Odoo 登录页出现 SSO 按钮
- [ ] 点按钮后 authorize 返 **302** 且 Location 带 `access_token`·`expires_in=120`
- [ ] 落回 Odoo `/web` 且**全程未输密码**
- [ ] `sso-evidence.sh` 对「SSO 登录后的新 session_id」返 `uid>0`（且该 uid 非密码登录的 admin）
- [ ] 抽查异常路径：未登 SaaS→401·token 过期→401·邮箱未验证→403

---

## 6. 故障速查（照状态码定位）

| 现象 | 根因 | 处置 |
|------|------|------|
| 登录页**没有 SSO 按钮** | provider 未建/未勾 `Allowed`/`auth_oauth` 未装 | 回 §4 |
| 点按钮 authorize **400** | `client_id` 不等于 `odoo-prod`，或 redirect_uri 不在白名单（须 `http://localhost:8081/oauth2/callback`），或 **API 没重启** | 核对 `.env` + 重启 API |
| authorize **401** | 该浏览器没登录 SaaS（无会话 cookie） | 先 `http://localhost:5173` 登录 |
| authorize **404** | 路径/前缀不对（须 `/api/v1/oauth2/authorize`） | 核 §1 值 |
| 落回但 Odoo 报错取不到 user | `authorization_header=1` 没配，或容器连不到 `host.docker.internal:7009` | 回 §3 / §4-4 |
| userinfo **403** | SaaS 用户 `emailVerified=false` | 在 SaaS 置已验证（或库改） |
| userinfo **401** | token 超 120s TTL / 密钥不一致 | 快速操作 / 同一 `JWT_SECRET` |
| `sso-evidence.sh` 报 `syntax error ... 'newline'` | 照抄了尖括号占位符 | 用真实值、不带 `<>`（§5.3） |
| `sso-evidence.sh` 报 `user is not connected` | 喂了不存在/过期会话 | 重新登录取当前 session_id |

---

## 7. 收尾归档（验证通过后）
- 把 §5.3 成功输出（`uid=…` 那条）留存作结项证据。
- 如 SSO 验证暴露需改码的部署态适配 → 另立第六小片·过审计门·不即兴改（见 runbook 边界）。
- 本手册与 runbook 均为文档态；`.env`/容器配置属高危面，改动归人、不入 VCS（`.env` 已 gitignore）。

---

## 附：相关可执行脚本（均在 `tmp/`·gitignore·本地工具）
| 脚本 | 用途 |
|------|------|
| `tmp/sso-live-smoke.sh` | §2 部署态 fail-closed 复验（4 探针·无写操作） |
| `tmp/sso-evidence.sh <sid>` | §5.3 SSO 登录后进 Odoo 的会话取证（`--noproxy`·python3 解析） |
| `tmp/sso-commit.sh` | 五片原子提交编排（已完成·留档） |
| `tmp/sso-closeout-checklist.md` | 一页式收尾导航 |
