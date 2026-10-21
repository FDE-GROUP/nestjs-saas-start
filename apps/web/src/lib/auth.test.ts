import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSession, signInEmail, signOut } from './auth';

// auth 门面纯逻辑单测：fetch 全 mock，不发真实网络。
function fetchStub(init: { ok: boolean; status?: number; payload?: unknown }) {
  return vi.fn().mockResolvedValue({
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 401),
    json: async () => init.payload ?? {},
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('auth 门面（Better Auth HTTP 面）', () => {
  it('get-session 401 → null（无会话收敛形）', async () => {
    const f = fetchStub({ ok: false, status: 401 });
    vi.stubGlobal('fetch', f);
    await expect(getSession()).resolves.toBeNull();
    expect(f.mock.calls[0][0]).toBe('/api/v1/auth/get-session');
  });

  it('get-session 200 → 原样带出 user/session', async () => {
    const payload = { user: { id: 'u1', email: 'a@b.c' }, session: { id: 's1', expiresAt: 'x' } };
    const f = fetchStub({ ok: true, payload });
    vi.stubGlobal('fetch', f);
    await expect(getSession()).resolves.toEqual(payload);
  });

  it('get-session 5xx → 抛出（后端/反代故障不当作无会话）', async () => {
    vi.stubGlobal('fetch', fetchStub({ ok: false, status: 502 }));
    await expect(getSession()).rejects.toThrow(/会话服务不可用/);
  });

  it('get-session 网络异常（fetch reject）→ 抛出', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net down')));
    await expect(getSession()).rejects.toThrow(/会话服务不可用/);
  });

  it('sign-in/email 携带 same-origin 凭证与 JSON body；失败带 message', async () => {
    const ok = fetchStub({ ok: true });
    vi.stubGlobal('fetch', ok);
    await expect(signInEmail('a@b.c', 'pw')).resolves.toMatchObject({ ok: true, status: 200 });
    const [url, init] = ok.mock.calls[0];
    expect(url).toBe('/api/v1/auth/sign-in/email');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.c', password: 'pw' });

    const bad = fetchStub({
      ok: false,
      status: 401,
      payload: { message: 'Invalid email or password' },
    });
    vi.stubGlobal('fetch', bad);
    await expect(signInEmail('a@b.c', 'wrong')).resolves.toMatchObject({
      ok: false,
      error: 'Invalid email or password',
    });
  });

  it('sign-in/email 5xx → 归一为「服务暂时不可用」', async () => {
    vi.stubGlobal('fetch', fetchStub({ ok: false, status: 502 }));
    await expect(signInEmail('a@b.c', 'pw')).resolves.toMatchObject({
      ok: false,
      error: '服务暂时不可用，请稍后重试',
    });
  });

  it('sign-out 打相对路径 POST', async () => {
    const f = fetchStub({ ok: true });
    vi.stubGlobal('fetch', f);
    await signOut();
    expect(f.mock.calls[0][0]).toBe('/api/v1/auth/sign-out');
  });
});
