---
kind: external_dependency
name: Better Auth 会话与外部 OAuth RP
slug: better-auth
category: external_dependency
category_hints:
    - auth_protocol
    - framework_behavior
scope:
    - '**'
---

### 角色与集成点
- **外部 Provider RP**：`OAUTH_PROVIDERS` 配置 github/google/apple/飞书，经 genericOAuth channels 消费；与 Odoo SSO（本仓作 OP）是两条独立路径。
- **Session 语义**：浏览器不存 token，会话即 Cookie+DB；同 host 不同端口天然共享 cookie，但写操作受 Origin 白名单限制。

### 稳定约束
- 跨源部署需配 cookie `Domain` 或 `SameSite=None+Secure`；推荐 apps/web 与 API 同域（挂 `:7009` 子路径）以免扩白名单。
- `authorize` deny-by-default：无 SaaS 会话时 401，demo 需登录门先建会话。