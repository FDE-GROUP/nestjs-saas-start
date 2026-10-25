# 预置 SaaS SSO（OIDC OP）到 odoo-demo 库·幂等。经 `odoo shell -d odoo-demo < 本文件` 执行。
# 承 runbook §4（Odoo 侧 SSO 全为库内配置·零代码）+ 本窗取证 redirect_uri = {url_root}auth_oauth/signin。
# 同容器内：浏览器经宿主端口 localhost:7009/8069；Odoo 服务端 userinfo 走 127.0.0.1:7009。
# Odoo 20 已移除 set_param/get_param，改为类型化 setter（get_bool/get_str 读）·@api.model 需 admin → sudo。
params = env["ir.config_parameter"].sudo()
params.set_bool("auth_oauth.authorization_header", True)   # res_users.py:48 用 get_bool 读：服务端以 Authorization: Bearer 打 userinfo
params.set_str("web.base.url", "http://localhost:8069")    # res_config_settings.py:12 用 get_str 拼 redirect_uri（须与 SSO_OAUTH_CLIENTS 精确一致）

Provider = env["auth.oauth.provider"]
vals = {
    "name": "SaaS SSO",
    "client_id": "saas-demo",
    "auth_endpoint": "http://localhost:7009/api/v1/oauth2/authorize",
    "validation_endpoint": "http://127.0.0.1:7009/api/v1/oauth2/userinfo",
    "scope": "openid profile email",
    "body": "使用 SaaS 登录",   # 登录页按钮文案
    "enabled": True,
    "sequence": 1,
}
existing = Provider.search([("name", "=", "SaaS SSO")])
if existing:
    existing.write(vals)
else:
    Provider.create(vals)
env.cr.commit()
print("[demo] OAuth provider + 系统参数 预置完成")
