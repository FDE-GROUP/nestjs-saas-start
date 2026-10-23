import type { CursorPage } from '@core/saas-kit/shared-kernel/domain/pagination';
import { TenantScopeGuard } from '@core/saas-kit/tenancy/tenant-scope.guard';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SerializeOptions } from '@nestjs/common/serializer/index.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type CreatePost,
  createPostSchema,
  type ListCursorQuery,
  listCursorQuerySchema,
  postCursorPageSchema,
  postViewSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
} from '../../../common/contracts/api-contracts';
import { CreatePostCommand } from '../application/commands/create-post.command';
import { ListPostsQuery } from '../application/queries/list-posts.query';
import type { PostReadModel } from '../application/read-models/post.read-model';
import { PostCursorPageResponse, PostResponse } from './response/post.response';

/**
 * Reference tenant-scoped resource (global-tenancy S2 · FR-5). Both routes are gated by
 * `TenantScopeGuard` (fail-closed: no active tenant → 403) and read/write exclusively
 * through the tenant-scoped repository — the handler never names a tenant id. This is the
 * template future business features copy, so the isolation boundary is idiomatic, not bolted on.
 */
@ApiTags('posts')
// F1 契约面（甲①）：响应 schema 经 @ApiResponse 真挂 DTO；envelope/error 公共形入 components。
@ApiExtraModels(ApiEnvelope, ApiErrorResponse, PostResponse, PostCursorPageResponse)
@Controller('posts')
@UseGuards(TenantScopeGuard)
export class PostsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @SerializeOptions({ schema: postCursorPageSchema })
  @ApiOperation({ summary: 'List posts in the active organization (cursor-paginated)' })
  @ApiResponse(
    apiEnvelopeShape(PostCursorPageResponse, {
      description: 'Cursor page of posts owned by the active organization.',
    }),
  )
  @ApiResponse(apiError(400, 'Malformed cursor.'))
  @ApiResponse(apiError(403, 'No active organization context.'))
  list(
    @Query({ schema: listCursorQuerySchema }) request: ListCursorQuery,
  ): Promise<CursorPage<PostReadModel>> {
    return this.queryBus.execute<ListPostsQuery, CursorPage<PostReadModel>>(
      new ListPostsQuery(request),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @SerializeOptions({ schema: postViewSchema })
  @ApiOperation({ summary: 'Create a post in the active organization' })
  @ApiResponse(
    apiEnvelopeShape(PostResponse, {
      status: 201,
      description: 'Created post stamped with the active organization.',
    }),
  )
  @ApiResponse(apiError(403, 'No active organization context.'))
  create(@Body({ schema: createPostSchema }) dto: CreatePost): Promise<PostReadModel> {
    return this.commandBus.execute<CreatePostCommand, PostReadModel>(
      new CreatePostCommand(dto.title, dto.content ?? null, dto.published),
    );
  }
}
