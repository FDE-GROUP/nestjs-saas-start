import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';
import type { PostReadModel } from '../read-models/post.read-model';

/**
 * 创建租户所内帖子的写侧命令（仅携原始值）。
 *
 * @remarks
 * Write-side intent to create a tenant-owned post. Carries primitives only; the owning
 * tenant is NOT a field — it is stamped from the trusted context by the repository.
 * @public
 */
export class CreatePostCommand extends BaseCommand<PostReadModel> {
  constructor(
    readonly title: string,
    readonly content?: string | null,
    readonly published?: boolean,
  ) {
    super();
  }
}
