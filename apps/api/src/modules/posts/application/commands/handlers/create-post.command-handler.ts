import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Post } from '../../../domain/entities/post';
import { POST_REPOSITORY, type PostRepository } from '../../../domain/repositories/post.repository';
import { type PostReadModel, toPostReadModel } from '../../read-models/post.read-model';
import { CreatePostCommand } from '../create-post.command';

@CommandHandler(CreatePostCommand)
export class CreatePostCommandHandler implements ICommandHandler<CreatePostCommand, PostReadModel> {
  constructor(@Inject(POST_REPOSITORY) private readonly posts: PostRepository) {}

  async execute(command: CreatePostCommand): Promise<PostReadModel> {
    // 领域工厂承载创建不变量；发布态经**纯转移** `withPublished`（返回新实例·FC 口径·终态仍由 DTO 决定·外部行为不变）。
    // `draft` 缺省未发布，故 else 分支无需转移，行为逐字等价。
    const draft = Post.draft({ title: command.title, content: command.content });
    const post = command.published ? draft.withPublished() : draft;
    const saved = await this.posts.create(post);
    return toPostReadModel(saved);
  }
}
