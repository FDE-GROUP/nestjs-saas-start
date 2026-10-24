import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Post } from '../../../domain/entities/post';
import { POST_REPOSITORY, type PostRepository } from '../../../domain/repositories/post.repository';
import { type PostReadModel, toPostReadModel } from '../../read-models/post.read-model';
import { CreatePostCommand } from '../create-post.command';

/**
 * 创建帖子的写侧命令处理器（经领域工厂 `Post.draft` + 仓储端口落库·返回传输投影）。
 * @public
 */
@CommandHandler(CreatePostCommand)
export class CreatePostCommandHandler implements ICommandHandler<CreatePostCommand, PostReadModel> {
  constructor(@Inject(POST_REPOSITORY) private readonly posts: PostRepository) {}

  /**
   * 执行创建：构造草稿态领域实体，按需纯转移发布，交仓储落库后映射为传输投影。
   * @param command - 创建命令（title/content/published）。
   * @returns 落库后的 `PostReadModel`。
   */
  async execute(command: CreatePostCommand): Promise<PostReadModel> {
    // 领域工厂承载创建不变量；发布态经**纯转移** `withPublished`（返回新实例·FC 口径·终态仍由 DTO 决定·外部行为不变）。
    // `draft` 缺省未发布，故 else 分支无需转移，行为逐字等价。
    const draft = Post.draft({ title: command.title, content: command.content });
    const post = command.published ? draft.withPublished() : draft;
    const saved = await this.posts.create(post);
    return toPostReadModel(saved);
  }
}
