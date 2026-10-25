# -*- coding: utf-8 -*-
# all-in-one demo bake：预配 Odoo 内部用户并绑定 SaaS SSO（承方案 ⓑ「预配优先」）。
#
# 缘起（实现期实采）：Odoo auth_oauth 隐式流对**未匹配**的 SSO 身份走 auth_signup 的
#   JIT 建号，但演示库有两处致命阻塞：
#     1) 内置 `admin` 用户 email 正是 `admin@example.com`，与 SaaS 演示 admin 邮箱撞车
#        → `_signup_create_user` 抛 UserError「Another user is already registered…」→ AccessDenied → 登录页报
#        「no access to this database / invitation expired」（oauth_error=3）。
#     2) 即便建号，`_create_user_from_template` 复制的是 portal 模板用户 → 出来是 portal/share 用户，进不了 ERP 后台。
#   对 ERP 演示，正确解=按 SaaS 用户预配**内部** res.users 并绑定 (oauth_provider_id, oauth_uid=sub)，
#   使 `_auth_oauth_signin` 直接按 (oauth_uid, provider) 命中、走成功分支（不 signup、不撞车、可进 /web）。
#
# 输入：/tmp/saas_users.txt（由 entrypoint 从 SaaS 库 psql 导出，每行 `sub|email|name`）。
# 幂等：已按 (oauth_uid, provider) 绑定则跳过；login 已存在（如内置 admin）则跳过、不改他人账号。
# 仅 demo 镜像内数据动作，零应用核心码/零 schema。

import os

provider = env["auth.oauth.provider"].sudo().search([("client_id", "=", "saas-demo")], limit=1)
if not provider:
    print("[seed_odoo_users] 未找到 client_id=saas-demo 的 provider，跳过（应在其之后执行）")
else:
    Users = env["res.users"].sudo()
    g_user = env.ref("base.group_user").id
    path = "/tmp/saas_users.txt"
    if not os.path.exists(path):
        print("[seed_odoo_users] 缺少 %s，跳过" % path)
    else:
        created, skipped = 0, 0
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.rstrip("\n")
                if not line or "|" not in line:
                    continue
                parts = line.split("|")
                sub = parts[0].strip()
                email = parts[1].strip() if len(parts) > 1 else ""
                name = "|".join(parts[2:]).strip() if len(parts) > 2 else email
                if not sub or not email:
                    continue
                # 已绑定则幂等跳过
                if Users.search_count([("oauth_uid", "=", sub), ("oauth_provider_id", "=", provider.id)]):
                    skipped += 1
                    continue
                login = email
                # login 撞车（如内置 admin 用户 login='admin' 不会撞 email；此处仅防 login 已存在）
                if Users.with_context(active_test=False).search_count([("login", "=", login)]):
                    print("[seed_odoo_users] login 已存在，跳过：%s" % login)
                    skipped += 1
                    continue
                Users.with_context(no_reset_password=True).create(
                    {
                        "name": name or login,
                        "login": login,
                        "email": email,
                        "oauth_provider_id": provider.id,
                        "oauth_uid": sub,
                        "active": True,
                        "group_ids": [(6, 0, [g_user])],  # 内部用户 → 可进 /web 后台
                    }
                )
                created += 1
        env.cr.commit()
        print("[seed_odoo_users] 预配内部 SSO 用户：created=%d skipped=%d" % (created, skipped))
