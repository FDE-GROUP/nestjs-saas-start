import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { SessionRequest, SessionUser } from '../guards/session.guard';

/**
 * 提取由 `SessionGuard` 挂载的已认证主体。
 *
 * @remarks
 * Extracts the authenticated principal populated by `SessionGuard`.
 * Usage: `@CurrentUser() user: SessionUser`.
 * @public
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<SessionRequest>();
  return req.sessionUser as SessionUser;
});
