---
kind: external_dependency
name: Odoo 集成（SSO + JSON-RPC/JSON-API + demo bake）
slug: odoo
category: external_dependency
category_hints:
    - framework_behavior
    - client_constraint
scope:
    - '**'
---

### 角色与集成点
- **SSO OP**：本仓作为 Odoo 的 IdP，暴露 `/oauth2/authorize`（隐式流、HS256、aud 绑定、精确 redirect 白名单）与 `/oauth2/userinfo`（Bearer 验签、aud∈受众、邮箱已验证硬门），由 `modules/auth/oauth-sso` 提供；demo 镜像通过 `auth_oauth` 在 Odoo 侧触发 authorize。
- **RPC 出站通道**：`features/odoo-rpc-api` 用 Nest 原生 fetch 调用 Odoo JSON-RPC `/jsonrpc`（`common.authenticate` → `execute_kw`），并评估 Odoo 17+ 官方推荐的 `/jsonapi`（search_read 一步到位、无 authenticate 往返）；鉴权走服务账号 + API key（`security_key`），凭证仅 env，永不入库。
- **Demo bake**：`docker/demo/entrypoint.sh` + `Dockerfile.demo` 启动 Odoo CE、安装 `sale/stock/crm` 等模块、预配内部用户并绑定 `oauth_uid=sub`，再起 Nest 与登录门反代。

### 关键约束（稳定行为）
- 协议选型分叉：优先实测 `/jsonapi`，失败退 `/jsonrpc`；两者对 API key 的支持细节须对活体 `odoo:20` 真跑对拍。
- 安全红线：Nest 只暴露类型化端点（partner/product/sale.order 白名单），**绝不建通用 RPC 代理**；CSRF origin guard 只拦写方法，GET/HEAD/OPTIONS 放行。
- 租户隔离：单库多公司模型下，所有 Odoo 读用例必须注入 `company_id` 域过滤，客户端不允许自选公司。
- Demo 已知坑：内置 admin email 为 `admin@example.com`，与 SaaS 演示 admin 撞车导致 JIT signup 抛 `UserError`；需 bake 中预配内部用户并授业务 app 组集（`base.user_admin` 组集），模块名是 `sale` 非 `sales`。

verify exact API/params against official Odoo docs (JSON-RPC /jsonrpc and JSON-API /jsonapi endpoints).