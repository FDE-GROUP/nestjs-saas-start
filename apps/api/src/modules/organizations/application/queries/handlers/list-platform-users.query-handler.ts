import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  USER_GOVERNANCE_REPOSITORY,
  type UserGovernanceRepository,
} from '../../../domain/repositories/user-governance.repository';
import type { PlatformUserPage } from '../../read-models/platform-user.read-model';
import { ListPlatformUsersQuery } from '../list-platform-users.query';

/**
 * Cross-platform user list (FR-6). Deliberately tenant-agnostic: the governance repository
 * applies NO tenant filter (platform-level sees every user, FR-11①); access is gated
 * upstream by `PlatformOperatorGuard` on the controller route.
 */
@QueryHandler(ListPlatformUsersQuery)
export class ListPlatformUsersQueryHandler implements IQueryHandler<ListPlatformUsersQuery> {
  constructor(
    @Inject(USER_GOVERNANCE_REPOSITORY)
    private readonly governance: UserGovernanceRepository,
  ) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ListPlatformUsersQuery): Promise<PlatformUserPage> {
    return this.governance.list({
      limit: query.limit,
      offset: query.offset,
      search: query.search,
    });
  }
}
