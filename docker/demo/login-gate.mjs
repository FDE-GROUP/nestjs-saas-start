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
import http from 'node:http';

const GATE_PORT = Number(process.env.GATE_PORT || 7009);
const UP_HOST = process.env.UPSTREAM_HOST || '127.0.0.1';
const UP_PORT = Number(process.env.UPSTREAM_PORT || 7011);
// 登录成功后回跳的 Odoo 登录页（用户在此点「使用 SaaS 登录」，此时 :7009 会话已就位）。
const ODOO_LOGIN_URL = process.env.ODOO_LOGIN_URL || 'http://localhost:8069/web/login';

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
  if (req.method === 'GET' && isGatePath(req.url)) {
    serveLogin(res);
    return;
  }
  proxyToApp(req, res);
});

server.listen(GATE_PORT, '0.0.0.0', () => {
  console.log(`[gate] 登录门反代 :${GATE_PORT} → 上游 ${UP_HOST}:${UP_PORT} · 前往页 ${ODOO_LOGIN_URL}`);
});
