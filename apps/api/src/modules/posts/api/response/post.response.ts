import type { CursorPage } from '@core/saas-kit/shared-kernel/domain/pagination';
import { ApiProperty } from '@nestjs/swagger';
import type { PostCursorPage, PostView } from '@saas/contracts/index';
import type { PostReadModel } from '../../application/read-models/post.read-model';

/**
 * posts 上下文响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 * 真相源 = controller 实际返回类型 `PostReadModel (≡ PostRecord)`；漂移防线见文末编译期双向赋值锁。
 */
export class PostResponse {
  @ApiProperty({ description: 'UUIDv7。' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true, type: 'string' })
  content!: string | null;

  @ApiProperty()
  published!: boolean;

  @ApiProperty({ description: '所属租户（ALS 盖章，body 不接受）。' })
  organizationId!: string;

  @ApiProperty({ nullable: true, type: 'string', description: '所属工作区；NULL = 未分区。' })
  workspaceId!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

// —— 编译期双向对拍：response 类与真相源结构恒等，任一侧漂移则 tsc 红。——
const _pfwd: PostResponse = {} as PostReadModel;
const _pbwd: PostReadModel = {} as PostResponse;
void _pfwd;
void _pbwd;

/**
 * 游标分页整体响应（`CursorPage<PostReadModel>`）——拦截器 normal 分支将整个分页对象裹入 data
 * （`CursorPage` 无 `meta` 键，不触发 `{items,meta}` 提升）。
 */
export class PostCursorPageResponse {
  @ApiProperty({ isArray: true, type: () => PostResponse })
  items!: PostResponse[];

  @ApiProperty({ description: '是否还有下一页。' })
  hasMore!: boolean;

  @ApiProperty({ required: false, description: '不透明游标（hasMore=false 时缺省）。' })
  nextCursor?: string;
}

// CursorPage 的 items 为 readonly，故取「类→接口」单向锁（拓字段缺失/多余）。
const _cpbwd: CursorPage<PostReadModel> = {} as PostCursorPageResponse;
void _cpbwd;

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 真相源（缺字段红；多字段由 strip 剥落兜底）。——
const _ps1: PostView = {} as PostReadModel;
const _ps2: PostReadModel = {} as PostView;
const _pcp: CursorPage<PostReadModel> = {} as PostCursorPage;
void _ps1;
void _ps2;
void _pcp;
