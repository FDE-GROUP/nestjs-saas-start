// ============================================================================
// all-in-one demo 登录门 + 零依赖反向代理（承方案 module-odoo-allinone-demo.md 切片 F）
//
// 缘起：demo 只内置 SaaS 的 API、无网页前端；SSO 的 authorize 端点走全局会话墙
//   （deny-by-default·无 SaaS 会话即 401），故浏览器点 Odoo「使用 SaaS 登录」会停 401
//   （Quickstart §3c 缺口）。本件补一个**浏览器可用的 SaaS 登录入口**，闭合 §1 目标3。
//
// 设计约束（守恒·铁律）：
//   - 零应用核心码 / 零 schema / 零契约——本件是 demo-only 运行期件（同 entrypoint.sh 性质）。
//   - **不改 authorize**：不引入"未登录 302 跳登录页"（那触 auth 面高危 + 破 deny-by-default + 回归 e2e）。
//   - 会话 cookie 落 :7009、CSRF 校验需 Origin=http://localhost:7009 → 登录门必须与 API **同源**。
//
// 机制：监听宿主 :7009（对外·发布端口不变），把 /api/*（及非门路径）原样透传到内部 Nest
//   （127.0.0.1:7011·不对宿主发布）；对 / 出一个内联 HTML 登录门——表单同源 fetch
//   /api/v1/auth/sign-in/email（Origin 自动为 :7009·过 CSRF 守卫·cookie 落 :7009），
//   成功后跳回 Odoo 登录页，由 Odoo 的按钮以**其自生成的 state** 正规发起 authorize→302→Odoo。
//   （注：不可由门臆造 state 直塞 /auth_oauth/signin——Odoo 隐式流回调会校验它自己存的 oauth_state。）
//
// 仅用 node 内置模块，不新增依赖、不装 apt 组件。
// ============================================================================
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const GATE_PORT = Number(process.env.GATE_PORT || 7009);
const UP_HOST = process.env.UPSTREAM_HOST || '127.0.0.1';
const UP_PORT = Number(process.env.UPSTREAM_PORT || 7011);
// 登录成功后回跳的 Odoo 登录页（用户在此点「使用 SaaS 登录」，此时 :7009 会话已就位）。
const ODOO_LOGIN_URL = process.env.ODOO_LOGIN_URL || 'http://localhost:8069/web/login';
// 切片 G：同源子路径服务 apps/web 静态产物（与 API/门同源→会话 cookie 天然共享·免二次登录）。
// WEB_BASE 不带尾斜杠（挂载前缀）；需与镜像构建时 apps/web 的 vite base（`/app/`带尾斜杠）对齐。
const WEB_BASE = (process.env.WEB_BASE || '/app').replace(/\/+$/, '');
const WEB_DIST = process.env.WEB_DIST || '/opt/web/dist';
// 切片 D：第二个同源 SPA 挂载点——私有叠加层演示前端 odoo-rpc（与 apps/web 同机制·同域免改 ALLOWED_ORIGINS）。
// ODOO_RPC_BASE 不带尾斜杠；需与镜像构建时 web/odoo-rpc 的 vite base（`/odoo-rpc/`带尾斜杠）对齐。
const ODOO_RPC_BASE = (process.env.ODOO_RPC_BASE || '/odoo-rpc').replace(/\/+$/, '');
const ODOO_RPC_DIST = process.env.ODOO_RPC_DIST || '/opt/odoo-rpc/dist';
// 多 SPA 静态服务表（顺序即匹配优先级·两者皆走 serveWeb 同一泛化函数）。
const SPAS = [
  { base: WEB_BASE, dist: WEB_DIST },
  { base: ODOO_RPC_BASE, dist: ODOO_RPC_DIST },
];

const LOGIN_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SaaS 登录 · 演示</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
      background:#0f172a; color:#e2e8f0; }
    .card { width:min(420px,92vw); padding:32px 28px; border-radius:16px;
      background:#1e293b; border:1px solid #334155; }
    h1 { font-size:20px; margin:0 0 4px; }
    p.lead { color:#94a3b8; font-size:13px; margin:0 0 22px; }
    label { display:block; font-size:13px; color:#cbd5e1; margin:14px 0 6px; }
    input { width:100%; padding:10px 12px; border-radius:8px; border:1px solid #475569;
      background:#0f172a; color:#e2e8f0; font-size:14px; }
    button { width:100%; margin-top:22px; padding:11px; border:0; border-radius:8px;
      background:#38bdf8; color:#031018; font-size:15px; font-weight:600; cursor:pointer; }
    button:disabled { opacity:.6; cursor:default; }
    p.alt { text-align:center; font-size:12px; color:#94a3b8; margin:14px 0 0; }
    #msg { margin-top:16px; font-size:13px; min-height:18px; white-space:pre-wrap; }
    #msg.err { color:#fca5a5; } #msg.ok { color:#86efac; }
    footer { margin-top:20px; font-size:11px; color:#64748b; }
    a { color:#7dd3fc; }
  </style>
</head>
<body>
  <form class="card" id="f">
    <h1>登录 SaaS</h1>
    <p class="lead">先在此建立 SaaS 会话，随后在 Odoo 登录页点「使用 SaaS 登录」即可一键进入。</p>
    <label>邮箱</label>
    <input name="email" type="email" autocomplete="username" value="admin@example.com" required>
    <label>密码</label>
    <input name="password" type="password" autocomplete="current-password" value="admin123" required>
    <button id="b" type="submit">登录并前往 Odoo</button>
    <p class="alt">或 <a href="${WEB_BASE}/">直接进入 Web 应用（apps/web）→</a>·登录后同一会话免二次登录</p>
    <p class="alt">或 <a href="${ODOO_RPC_BASE}/">Odoo 数据演示（odoo-rpc 集成能力）→</a>·同一会话直读 Odoo 客户/商品</p>
    <div id="msg"></div>
    <footer>演示账号：<code>admin@example.com</code> / <code>admin123</code>（或 <code>user1@example.com</code> / <code>user123</code>）·数据 ephemeral·仅 demo。</footer>
  </form>
  <script>
    const f = document.getElementById('f');
    const b = document.getElementById('b');
    const msg = document.getElementById('msg');
    const ODOO = ${JSON.stringify(ODOO_LOGIN_URL)};
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      b.disabled = true; msg.className = ''; msg.textContent = '登录中…';
      const email = f.email.value.trim();
      const password = f.password.value;
      try {
        const r = await fetch('/api/v1/auth/sign-in/email', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!r.ok) {
          let detail = '';
          try { const j = await r.json(); detail = j && (j.message || j.error && j.error.message) ? '' : ''; } catch (_) {}
          msg.className = 'err';
          msg.textContent = '登录失败（HTTP ' + r.status + '）：请检查邮箱/密码。';
          b.disabled = false;
          return;
        }
        msg.className = 'ok';
        msg.textContent = 'SaaS 会话已就绪，正在前往 Odoo…';
        location.href = ODOO;
      } catch (err) {
        msg.className = 'err';
        msg.textContent = '出错：' + (err && err.message ? err.message : err);
        b.disabled = false;
      }
    });
  </script>
</body>
</html>`;

function serveLogin(res) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(LOGIN_HTML);
}

// ---- 切片 G：apps/web 静态服务（仅 node 内置 fs/path·零依赖）----
const WEB_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function sendFile(res, absPath) {
  const ext = path.extname(absPath).toLowerCase();
  const type = WEB_MIME[ext] || 'application/octet-stream';
  // 带 hash 的构建产物长缓存；index.html（入口/回退）不缓存。
  const cache = ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable';
  res.writeHead(200, { 'content-type': type, 'cache-control': cache });
  fs.createReadStream(absPath).pipe(res);
}

function serveWeb(res, urlPath, base, dist) {
  const root = path.resolve(dist);
  if (!fs.existsSync(root)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Web 应用尚未构建（demo 镜像缺 ' + dist + '）');
    return;
  }
  // 去 base 前缀 → dist 相对路径（`/app/assets/x.js`→`/assets/x.js`；`/app/`→`/`）。
  let rel = decodeURIComponent(urlPath.slice(base.length).split('?')[0] || '/');
  let abs = path.normalize(path.join(root, rel));
  if (!abs.startsWith(root)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }
  let st = null;
  try {
    st = fs.statSync(abs);
  } catch (_) {}
  if (st && st.isDirectory()) {
    abs = path.join(abs, 'index.html');
    try {
      st = fs.statSync(abs);
    } catch (_) {
      st = null;
    }
  }
  if (st && st.isFile()) {
    sendFile(res, abs);
    return;
  }
  // SPA fallback：无扩展名的前端路由回 index.html；带扩展名的缺失资源直接 404。
  if (path.extname(rel)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  const indexAbs = path.join(root, 'index.html');
  if (fs.existsSync(indexAbs)) {
    sendFile(res, indexAbs);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found');
}

// 透传到内部 Nest：保留原始 Host/Origin/Cookie/Authorization 等全部请求头，
// 原样回传状态码与响应头（含 302 Location 的 fragment、Set-Cookie）。
function proxyToApp(req, res) {
  const upstream = http.request(
    { host: UP_HOST, port: UP_PORT, path: req.url, method: req.method, headers: req.headers },
    (ur) => {
      res.writeHead(ur.statusCode || 502, ur.headers);
      ur.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end('{"message":"登录门上游不可达（SaaS 应用尚未就绪？）"}');
  });
  req.pipe(upstream);
}

const isGatePath = (rawUrl) => {
  const p = (rawUrl || '/').split('?')[0];
  return p === '/' || p === '/index.html' || p === '/login';
};

const server = http.createServer((req, res) => {
  const p = (req.url || '/').split('?')[0];
  if (req.method === 'GET') {
    // 切片 G/D：多 SPA 前缀逐个走静态服务（先于 /api 与门页判定）。
    for (const spa of SPAS) {
      if (p === spa.base) {
        res.writeHead(302, { location: spa.base + '/' });
        res.end();
        return;
      }
      if (p === spa.base + '/' || p.startsWith(spa.base + '/')) {
        serveWeb(res, p, spa.base, spa.dist);
        return;
      }
    }
    if (isGatePath(req.url)) {
      serveLogin(res);
      return;
    }
  }
  proxyToApp(req, res);
});

server.listen(GATE_PORT, '0.0.0.0', () => {
  console.log(
    `[gate] 登录门反代 :${GATE_PORT} → 上游 ${UP_HOST}:${UP_PORT} · 前往页 ${ODOO_LOGIN_URL} · Web ${WEB_BASE}/ (dist ${WEB_DIST}) · odoo-rpc ${ODOO_RPC_BASE}/ (dist ${ODOO_RPC_DIST})`,
  );
});
