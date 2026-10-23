import { afterEach, describe, expect, it, vi } from 'vitest';
import { logApiError } from './log';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logApiError（前端客户端日志单源·dev 结构化对映后端）', () => {
  // vitest 下 import.meta.env.DEV = true → 走 dev 分支：console.error(head, fields)。
  it('dev 下携 requestId/statusCode/errorCode 结构化字段', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logApiError(
      { path: '/api/v1/workspaces', scope: 'workspaces' },
      {
        message: '禁止访问',
        errorCode: 'ISOLATION:NO_ACTIVE_CONTEXT',
        requestId: 'req-7',
        statusCode: 403,
      },
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const [head, fields] = spy.mock.calls[0];
    expect(head).toContain('[api:workspaces]');
    expect(head).toContain('/api/v1/workspaces');
    expect(head).toContain('403');
    expect(fields).toMatchObject({
      requestId: 'req-7',
      statusCode: 403,
      errorCode: 'ISOLATION:NO_ACTIVE_CONTEXT',
      detail: '禁止访问',
    });
  });

  it('错误体自带 path 优先于 meta.path', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logApiError({ path: '/meta', scope: 'x' }, { message: 'boom', path: '/body' });
    expect(spy.mock.calls[0][0]).toContain('/body');
  });
});
