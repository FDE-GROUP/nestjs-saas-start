import type { AuthInstance } from '../auth.interface';

/** Resolved Better Auth session (`{ user, session }`) or null when there is none. */
export type ResolvedSession = Awaited<ReturnType<AuthInstance['api']['getSession']>> | null;

/** Shape every call site (middleware / guards) exposes: an inbound request with headers. */
export interface SessionRequestLike {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Single request-session resolution surface (global-tenancy S8 · FR-11「统一裁决」).
 *
 * Before S8 the same Better Auth session was resolved up to three times per request
 * (`TenantMiddleware` + `SessionGuard` + `PlatformOperatorGuard`). This helper resolves it
 * exactly once and memoizes the outcome on the request object via a `WeakMap`, so later
 * call sites in the same request reuse the result instead of re-reading the session store.
 *
 * Behaviour-preserving by design: it only forwards to `auth.api.getSession({ headers })`
 * and returns the raw result (or `null`). Each caller keeps its OWN semantics on top
 * (401 vs 403, DB email lookup, deny-list) — this surface never decides allow/deny.
 */
const resolved = new WeakMap<SessionRequestLike, ResolvedSession>();

export async function resolveRequestSession(
  auth: AuthInstance,
  req: SessionRequestLike,
): Promise<ResolvedSession> {
  const cached = resolved.get(req);
  if (cached !== undefined) return cached;
  const result =
    (await auth.api.getSession({ headers: req.headers as unknown as Headers })) ?? null;
  resolved.set(req, result);
  return result;
}
