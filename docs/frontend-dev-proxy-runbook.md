# 前端自助面 · dev 反代真跑手册（F2 runbook）

> 用途：人类验收 `apps/web` 租户自助面时，本地起「Postgres + Nest 后端 + Vite 前端」全栈，
> 经 dev `/api` 同源反代真跑取证——补 L1（编译/打包/测）覆盖不到的**运行时端到端**那一环。
> 关联方案：[plans/module-frontend-tenant-console](./plans/module-frontend-tenant-console.md) §5。
> 定位：操作手册（consumer），非裁判；命令以仓库实配为准，若与实配不符以 `package.json` / `.env` / compose 为真相源。

## 0. 实配速览（真相源核对）

| 项 | 值 | 来源 |
|----|----|------|
| 后端端口 / 全局前缀 | `:7009` · `/api/v1` | `.env` `PORT=7009` · `main.ts` |
| 前端 dev 端口 / 反代 | `:5173` · `/api` → `http://localhost:7009` | `apps/web/vite.config.ts` |
| Postgres（dev） | `postgres:16-alpine` @ `5432` · db `nestjs_practice` · user/pass `postgres` | `docker-compose.dev.yml` |
| pgadmin 调试台 | `dpage/pgadmin4:8` @ `:5050` · UI 登录 `admin@example.com`/`admin` · 连库口令 `postgres` | `docker-compose.dev.yml` + `docker/pgadmin/servers.json` |
| 连接串 | `postgres://postgres:postgres@localhost:5432/nestjs_practice` | `.env` `DATABASE_URL` |
| seed 兜底账号（仅开发·现可密码登录·见 §7） | `admin@example.com` / `admin123` · `user{i}@example.com` / `user123` | `apps/api/src/database/seed.ts` |
| BA 会话面 | `/api/v1/auth/{sign-in,email}` · `/sign-up/email` · `/get-session`（Cookie+DB Session） | `apps/web/src/lib/auth.ts` |

> ⚠️ 迁移/种子（步 2）属 **AGENTS §2 高危**——须人自行执行，Agent 不代跑。

## 1. 前置（一次性）

```bash
pnpm install          # 链好 @saas/api-client → apps/web（workspace symlink）
pnpm run build        # build:libs → build:client（产 dist + 拷贝 schema.d.ts）→ build:nest
```

## 2. 起 Postgres + 迁移种子（⚠️ 高危·人执行）

```bash
docker compose -f docker-compose.dev.yml up -d postgres
docker compose -f docker-compose.dev.yml ps postgres   # 等 healthcheck = healthy
pnpm run db:setup                                        # mikro-migrate + db:seed
# 首跑 warn「弱口令兜底 admin123/user123（仅开发）」属预期
# 重播种子：seed 对测试用户非幂等·裸跑 db:seed 再撞唯一键 → SEED_CLEANUP=true pnpm run db:seed（先清 post+user）或 pnpm run db:reset（破坏·仅 dev）
```

## 2b. pgadmin 调试台（可选·直观看库）

```bash
docker compose -f docker-compose.dev.yml up -d        # 一并拉起 pg16 + pgadmin
# 浏览器开 http://localhost:5050
```

- **两套口令别混**：pgadmin **Web 登录** = `admin@example.com` / `admin`；点服务器连**数据库**时弹的口令 = `postgres`（PG user 口令）。报 `password authentication failed` 基本是连库口令错填成了 `admin`。
- **Host 用服务名 `postgres`**（compose DNS 可解·容器名 `postgres-dev` 亦可解），**不可**填网络名 `nestjs-network-dev`（不可解析 →「地址不对」）。
- **先跑 §2 `db:setup` 建表再连**：pg16 的 `nestjs_practice` 初始为空库，不建 schema 则展开无表可看。
- **servers.json 只播种一次**：`docker/pgadmin/servers.json` 仅在 `pgadmin-data-dev` 卷**为空**时自动登记那条 `nestjs_practice-dev`；此后 UI 改动存于卷内 `pgadmin4.db`，重启不覆盖。若被改乱想回正：`docker volume rm nestjs-project-template_pgadmin-data-dev` 后重 `up -d pgadmin` 即按 servers.json 重播种。

## 3. 起后端（终端 A）

```bash
pnpm run start:dev    # nest --watch · :7009 · 前缀 /api/v1
```
就绪判据：`curl -s http://localhost:7009/api/v1/health` → 200。

## 4. 起前端（终端 B）

```bash
pnpm run dev:web      # vite :5173 · /api/* 反代 → :7009
```

## 5. 反代管道取证（curl 经 `:5173`，证同源反代 + api-client 路径）

```bash
# ① 未登录：会话墙应拒（deny-by-default）
curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:5173/api/v1/auth/get-session            # 期望 401（或 200 + body null）

# ② 登录取 cookie（seed 账号；401 见 §7 兜底）
curl -s -c /tmp/ck.txt -X POST http://localhost:5173/api/v1/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin123"}' -w "\nHTTP %{http_code}\n"

# ③ workspaces（F2a 旗舰 typed 面·经反代）
curl -s -b /tmp/ck.txt http://localhost:5173/api/v1/workspaces | head -c 400; echo
#   期望 200：{"data":{"items":[...],"total":N,"limit":..,"offset":0},"statusCode":200,"message":..}
#   无 active organization → 403：{...,"errorCode":"ISOLATION:NO_ACTIVE_CONTEXT"} —— 即页面 ErrorPanel 的窄化输入

# ④ 订阅摘要（首页面板数据源）
curl -s -b /tmp/ck.txt http://localhost:5173/api/v1/subscriptions/current | head -c 300; echo

# ⑤ 成员（Better Auth 透传面·非 Nest typed）
curl -s -b /tmp/ck.txt http://localhost:5173/api/v1/tenants/members | head -c 300; echo
```

**通过口径**：③④⑤ 均经 **5173**（非直连 7009）返回，且成功信封形为 `{data,statusCode,message}`——
证明 api-client 相对路径 `/api/v1/*` 在反代下真跑通、typed 形与后端实产一致（`openapi.yaml` SSOT 的运行时对拍）。

## 6. 浏览器 UI 取证（证 React loader → typed 渲染·curl 覆盖不到）

打开 `http://localhost:5173` → 跳 `/login` → 用 `admin@example.com / admin123` 登录，逐页核对：

| 路由 | 期望 |
|------|------|
| `/` | 「当前会话」邮箱 = 登录用户；下方「订阅摘要」有生效订阅显 plan/seatsLimit/used·remaining，否则显空态文案 |
| `/workspaces` | typed 分页表（名称/Slug/所属租户/创建日期 + `共 N 条 · 页宽 · 偏移`）；无 active tenant → 顶部红色 ErrorPanel 显 `message（errorCode）` |
| `/settings/members` | 成员表（用户 ID/角色）+ 「数据来源：Better Auth 透传面（非 Nest 契约类型）」标注 |

- DevTools → Network：请求命中 `/api/v1/*`（相对同源）、`credentials` 携带 cookie、响应 200/403 与页面渲染一致。
- 登出按钮 → 回 `/login`（会话墙同向）。

## 7. 登录说明（seed 号现可密码登录）

自 `module-db-seed-ba-loginable-accounts` 切片起，`db:seed` 经 Better Auth `signUpEmail` 亲自建 `user` + `account`（credential），故 **§5② 可直接用 seed 兜底号 `admin@example.com` / `admin123` 登录**（该邮箱即缺省 `platform.operatorEmail`·运营者身份·可进 `/platform/*` 平台治理面），不再需要注册绕行。

> 若 §5② 仍返回 `401`（库早于本片 seed·或 `db:seed` 未重跑）：重跑 `pnpm run db:setup`（reconcile 会补齐缺失的 `account` credential·幂等），或按下述经反代注册一个全新邮箱兜底（`apps/web` 无注册页·dev 邮箱密码面已开·`auth.implement.ts:213`·`NODE_ENV!=='production'`·勿用已被 `user.email` 唯一占用的 admin@/user1@）：

```bash
curl -s -X POST http://localhost:5173/api/v1/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"Passw0rd!","name":"Dev User"}' -w "\nHTTP %{http_code}\n"
```

> 新注册的**非运营者**号（如 dev@）进 `/platform/*` 会 403（`PlatformOperatorGuard` 靠 email === `platform.operatorEmail`）；平台治理面须用运营者 `admin@example.com`（或 `PLATFORM_OPERATOR_EMAIL` 所指邮箱）。另：无租户/成员关系的账号 → `/workspaces`、`/` 订阅等只读页会显 403/空态，属 deny-by-default 预期渲染，非登录失败。

## 8. 收尾（用完即焚）

```bash
docker compose -f docker-compose.dev.yml down      # 保数据卷；欲净库：加 -v 后重跑 db:setup
```

## 9. 判据回写

- §5（管道）+ §6（UI）两关皆绿 → 勾 `module-frontend-tenant-console` §5「dev 反代真跑端到端」框。
- 若 §6 任一页渲染/字段与 §5 curl 实际响应**不符** → 真缺陷（非 openapi-fetch 在 jsdom 相对 URL 抛错那类**环境限制**），据实回退到对应 F2 片修复并登 plan §6。
- **自动化回归锁（互补·非替代本手册首轮人肉 exploratory）**：本手册 §5/§6 的手动端到端链（登录→落租→一条核心写）已由部署态黄金流 E2E 机械锁定——`pnpm run test:e2e:web`（编排器 `scripts/e2e-web.ts` 起 Testcontainers 一次性 PG+迁移+seed+API+vite dev 真栈·`@playwright/test` 驱动·用完即焚·opt-in 不入默认 `ci`）。手动签核过后，后续回归优先跑此闸；新增黄金流页签请在 `e2e/*.spec.ts` 补测。
