# -*- coding: utf-8 -*-
# 切片 D bake：确保 Odoo 侧**只读 RPC 服务账号** `saas_rpc_ro` 在场，并签发 scope=rpc 长效密钥，
# 写 /tmp/odoo_rpc_key.txt（entrypoint 移到数据卷持久化·export 为 Nest 的 ODOO_API_KEY）。
# demo ephemeral 假凭证·零真实密钥入任何版本库。仅 demo 镜像内数据动作·零应用核心码。
#
# 活体裁据（2026-10-25·odoo:20 CE 实证·见 server/.../odoo-json.client.ts 头注同源）：
# - `common.authenticate` 通道**仅认 scope='rpc'** 的 key（'default' scope 走 /jsonapi·此处返 false）；
# - `res.users.apikeys._generate(self, scope, name, expiration_date)` 归属取 self.env.user.id，
#   故须 `env(user=uid)` 切上下文；非 system 环境 key 有效期上限 1 天 → `.sudo()` 破上限给 demo 长效。
# 幂等：saas_rpc_ro 已存在则仅重签 key（bake 段每次首启执行·MARKER 门控）。

from datetime import datetime, timedelta

LOGIN = "saas_rpc_ro"
KEY_FILE = "/tmp/odoo_rpc_key.txt"

Users = env["res.users"].sudo()
user = Users.search([("login", "=", LOGIN)], limit=1)
if not user:
    group_ids = [env.ref("base.group_user").id]  # 内部用户（可读 res.partner）
    for xmlid in ("sales.group_sale_salesman",):  # 只读商品/客户足够（sale 已装）
        try:
            group_ids.append(env.ref(xmlid).id)
        except Exception:
            pass
    user = Users.create(
        {
            "name": "SaaS RPC (read-only)",
            "login": LOGIN,
            "email": "saas_rpc_ro@example.com",
            "active": True,
            "group_ids": [(6, 0, group_ids)],  # Odoo 20 字段名（17 前为 groups_id·seed_odoo_users 同源）
        }
    )
    env.cr.flush()

keys = env(user=user.id)["res.users.apikeys"].sudo()
key = keys._generate("rpc", "demo-slice-d", datetime.now() + timedelta(days=365))
with open(KEY_FILE, "w") as f:
    f.write(key)
env.cr.commit()
print("[seed_odoo_rpc] saas_rpc_ro uid=%s · rpc-scope key 已签发 → %s" % (user.id, KEY_FILE))
