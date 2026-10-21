import { Post, type PostState } from '../../domain/entities/post';
import type { PostEntity } from '../entities/post.entity';

/**
 * posts 上下文 **领域实体 ⇄ 数据实体** 的唯一映射单点 + 编译期一致性闸（architecture「投影镜射教义」·
 * module-posts-fc-projection-doctrine）。
 *
 * 依赖方向：本文件居 `infrastructure/`（可上引 `domain/`、旁引同层 `entities/`）；**领域层绝不 import
 * `infrastructure/`**，故引用 `PostEntity` 的结构锁只能落在此、不可落 `domain/entities/post.ts`（否则依赖倒置违宪）。
 */

/**
 * 纯全函数 `fromRow`：数据实体 → 复原后的领域实体（投影镜射三件套之②·唯一映射缝）。零副作用——
 * 把可空列 `?? null` 归一为 {@link Post.restore} 的复原入参；写方向（`create` 生成 id/租户/时间戳）属外壳副作用，
 * 留在适配器、不纳入此纯 mapper，亦不纳入下方锁域。
 */
export function toPostDomain(entity: PostEntity): Post {
  return Post.restore({
    id: entity.id,
    title: entity.title,
    content: entity.content ?? null,
    published: entity.published,
    organizationId: entity.organizationId,
    workspaceId: entity.workspaceId ?? null,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });
}

/**
 * 一致性闸（投影镜射三件套之③）：领域持久态 {@link PostState} ⇄ 物理数据实体 {@link PostEntity} 结构同构。
 * 由 build 的 tsc 强制（`*.test.ts` 被 tsconfig.build 排除故不放测试里）。任一侧增/删/改列而另一侧不更，即编译失败。
 * 可空列差异（`PostEntity` 的 `content?`/`workspaceId?` 系 Mikro 未刷新态可选·{@link PostState} 恒必填）以
 * `Required<>` 归一后比较。导出仅为规避「未使用」告警，无运行时语义。
 */
// 数据实体新增列 → 左侧 `PostEntity` 要求之、右侧 `PostState` 缺 → 报错（防漏投影）。
export const __postStateIsSubtypeOfEntity: PostEntity = {} as PostState;
// 领域态新增字段 → 左侧 `PostState` 要求之、右侧 `Required<PostEntity>` 缺 → 报错（防凭空字段）。
export const __entityIsSubtypeOfPostState: PostState = {} as Required<PostEntity>;
