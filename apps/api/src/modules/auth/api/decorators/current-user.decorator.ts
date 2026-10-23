import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { SessionRequest, SessionUser } from '../guards/session.guard';

/**
 * Extracts the authenticated principal populated by `SessionGuard`.
 * Usage: `@CurrentUser() user: SessionUser`.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<SessionRequest>();
  return req.sessionUser as SessionUser;
});
