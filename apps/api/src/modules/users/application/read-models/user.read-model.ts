import type { UserRole } from '../../domain/repositories/user.repository';

/**
 * Read-model projection returned by query handlers (CQRS read side).
 * Mirrors the pre-refactor public user payload exactly.
 */
export interface UserReadModel {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/** Boolean `columns` map for relational queries (excludes password/name). */
export const userPublicColumns = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;
