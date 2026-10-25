#!/usr/bin/env bash
# all-in-one demo 镜像入口：首启 bake golden 库（PG + SaaS 应用库迁移/seed + Odoo 库/SSO provider），
# 随后拉起 Odoo + SaaS 应用。数据 ephemeral（容器销毁即重置·演示定位）。
#
# 进程布局：本脚本以 root 起 PG（OS user postgres）→ bake → 后台留存 PG → 拉起 odoo(user odoo) + app(node)。
# 定位=演示/试用（NODE_ENV=development·localhost PG 在数据驻留境内白名单内·假密钥·零真实凭证）。
set -euo pipefail

PG_BIN="/usr/local/pg-bin"           # 构建期 symlink 到 /usr/lib/postgresql/<ver>/bin
PGDATA="/var/lib/demo-pg/data"
PG_SOCK="/var/run/postgresql"
MARKER="/var/lib/demo-pg/.initialized"
APP_DIR="/saas-app"
DEMO_ENV="/etc/demo.env"
# tsx 在裁剪后的 pnpm 树里只存于 .pnpm 店（root devDep 的 node_modules/.bin 软链未生成）→ 解析真实 CLI。
TSX_BIN="$(ls "$APP_DIR"/node_modules/.pnpm/tsx@*/node_modules/tsx/dist/cli.mjs 2>/dev/null | head -1 || true)"

# ---- demo 运行期 env（假密钥·非真实凭证·不入任何 .env 版本库）----
export NODE_ENV="${NODE_ENV:-development}"
export HOST=0.0.0.0
export PORT="${PORT:-7009}"
export DATABASE_URL="${DATABASE_URL:-postgres://postgres@127.0.0.1:5432/nestjs_practice}"
export JWT_SECRET="${JWT_SECRET:-demo-only-insecure-jwt-secret-change-not-prod}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-demo-only-insecure-refresh-secret-change-not-prod}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-demo-only-insecure-better-auth-secret-32chars+}"
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:7009}"
export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:8069,http://localhost:7009,http://127.0.0.1:7009}"
export STORAGE_REGION="${STORAGE_REGION:-local}"
export STORAGE_ENDPOINT="${STORAGE_ENDPOINT:-http://localhost:9000}"
export STORAGE_ACCESS_KEY_ID="${STORAGE_ACCESS_KEY_ID:-demo}"
export STORAGE_ACCESS_KEY_SECRET="${STORAGE_ACCESS_KEY_SECRET:-demo}"
# SSO client 白名单：redirect_uri 精确 = Odoo auth_oauth 实采串（{url_root}auth_oauth/signin · 取证 2026-10-25）
# 注：值里含 `}`，绝不可写成 `${VAR:-默认}` 内联形式——bash 会在首个 `}` 提前终止参数展开→JSON 被截断。
if [ -z "${SSO_OAUTH_CLIENTS:-}" ]; then
  SSO_OAUTH_CLIENTS='[{"clientId":"saas-demo","redirectUris":["http://localhost:8069/auth_oauth/signin"],"audience":"odoo-demo"}]'
fi
export SSO_OAUTH_CLIENTS

# ---- 1. PostgreSQL 首启初始化 ----
mkdir -p "$PGDATA" "$PG_SOCK" /var/log/demo
# pg_ctl(以 postgres 运行) -l 要写 /var/log/demo/pg.log → 日志目录归 postgres（root 仍可越权写其余 *.log）
chown -R postgres:postgres "$PGDATA" "$PG_SOCK" /var/log/demo

start_pg() {
  su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -l /var/log/demo/pg.log -w start"
}

if [ ! -f "$MARKER" ]; then
  echo "[demo] 首次启动：initdb + bake golden 库"
  su postgres -c "$PG_BIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8" >/dev/null
  # 监听仅回环（同容器进程互访·外部端口发布由 Odoo/app 各自 HTTP 承担）
  echo "listen_addresses = '127.0.0.1'" >> "$PGDATA/postgresql.conf"
  start_pg

  echo "[demo] 建库/角色：nestjs_practice + odoo(LOGIN CREATEDB)"
  su postgres -c "$PG_BIN/createdb -U postgres nestjs_practice"
  su postgres -c "$PG_BIN/psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \"CREATE ROLE odoo LOGIN CREATEDB;\""

  echo "[demo] SaaS 应用库迁移 + seed（tsx·走 development 配置）"
  [ -n "$TSX_BIN" ] || { echo '[demo] 未在镜像内找到 tsx CLI'; exit 1; }
  ( cd "$APP_DIR" && node "$TSX_BIN" scripts/mikro-migrate.ts )
  ( cd "$APP_DIR" && node "$TSX_BIN" apps/api/src/database/seed.ts )

  # seed 走 Better Auth signUp——缺省 emailVerified=false，而 SSO userinfo 端点硬门要求已验证邮箱（否则 Odoo 点 SSO →403 email not verified）。
  # 属 demo 镜像内预置数据动作（不改 seed.ts/应用核心代码）：把演示用户一律置为已验证。
  echo "[demo] 演示用户置 emailVerified=true（SSO userinfo 硬门所需）"
  su postgres -c "$PG_BIN/psql -U postgres -d nestjs_practice -v ON_ERROR_STOP=1 -c 'UPDATE \"user\" SET \"emailVerified\" = true;'"

  echo "[demo] Odoo 库建 + 装模块（base/web/auth_oauth/auth_signup·demo 数据开）"
  su odoo -s /bin/bash -c "odoo -c /etc/odoo.conf -d odoo-demo -i base,web,auth_oauth,auth_signup --without-demo=False --stop-after-init --no-http" \
    >/var/log/demo/odoo-init.log 2>&1 || { echo '[demo] Odoo 建库失败:'; tail -40 /var/log/demo/odoo-init.log; exit 1; }

  echo "[demo] 预置 SSO OAuth provider + 系统参数（odoo shell）"
  su odoo -s /bin/bash -c "odoo shell -c /etc/odoo.conf -d odoo-demo --no-http < /opt/demo/seed_oauth_provider.py" \
    >>/var/log/demo/odoo-init.log 2>&1 || { echo '[demo] provider 预置失败:'; tail -40 /var/log/demo/odoo-init.log; exit 1; }

  touch "$MARKER"
  echo "[demo] bake 完成"
else
  echo "[demo] 已初始化，直接起 PG"
  start_pg
fi

# ---- 2. 拉起应用 + Odoo（PG 已后台留存）----
echo "[demo] 启动 SaaS 应用（node dist/apps/api/src/main.js）后台"
( cd "$APP_DIR" && exec node dist/apps/api/src/main.js ) >/var/log/demo/app.log 2>&1 &

echo "[demo] 启动 Odoo HTTP（user odoo）后台"
su odoo -s /bin/bash -c "exec odoo -c /etc/odoo.conf -d odoo-demo" >/var/log/demo/odoo.log 2>&1 &

# 等待 SaaS 健康（best-effort·不阻断容器存活）
for i in $(seq 1 30); do
  node -e "fetch('http://127.0.0.1:$PORT/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && { echo "[demo] SaaS :$PORT health 200"; break; }
  sleep 2
done

echo "[demo] all-in-one 就绪：SaaS http://localhost:7009/api/v1  ·  Odoo http://localhost:8069/web/login（点「使用 SaaS 登录」）"

# 保持前台：任一后台进程退出即容器结束（便于 docker run --rm 演示生命周期）
wait -n
exit 0
