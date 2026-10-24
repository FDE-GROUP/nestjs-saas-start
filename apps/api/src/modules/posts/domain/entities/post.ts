/**
 * 新建写意图（仅业务字段·原 `PostDraft` 语义上收为工厂入参）。
 * @public
 */
export interface PostDraftInput {
  /** 标题。 */
  title: string;
  /** 正文内容。 */
  content?: string | null;
}

/**
 * 持久层复原输入（全字段·含 id/租户/工作区/时间戳）。
 * @public
 */
export interface PostState {
  /** 实体唯一标识 id。 */
  id: string;
  /** 标题。 */
  title: string;
  /** 正文内容。 */
  content: string | null;
  /** 是否已发布。 */
  published: boolean;
  /** 所属租户 id。 */
  organizationId: string;
  /** 所属工作区 id。 */
  workspaceId: string | null;
  /** 创建时间。 */
  createdAt: Date;
  /** 更新时间。 */
  updatedAt: Date;
}

/**
 * posts 上下文的**充血领域实体**（Clean Architecture 锥体 Entities 层在本仓的首个物化样板）。
 *
 * @remarks
 * 与 `infrastructure/entities/post.entity.ts` 的**物理数据实体**（MikroORM `defineEntity`）严格分离：
 * 本类零框架依赖（不 import `@nestjs/*`/`@mikro-orm/*`/HTTP/其他上下文·守 layer 依赖表 domain/ 行），
 * 承载**不可变状态 + 构造期不变量 + 纯转移函数（返回新实例·FC 口径·architecture「投影镜射教义」）**；
 * 二者由仓储适配器经 `infrastructure/repositories/post-mapping.ts` 的纯 `fromRow` mapper 复原映射。
 *
 * 两阶段构造：{@link Post.draft} 新建写意图（业务字段·经不变量校验·id/租户/时间戳为 `null`）；
 * {@link Post.restore} 从持久层复原（含技术字段·不重复校验）。仓储 `create/findById/list` 一律返回
 * `restore` 后的**完整**实例，故到传输投影 `PostReadModel` 的映射只发生在完整实例上（领域实体绝不越界进 `api/`）。
 * @public
 */
export class Post {
  private constructor(
    private readonly _id: string | null,
    private readonly _title: string,
    private readonly _content: string | null,
    private readonly _published: boolean,
    private readonly _organizationId: string | null,
    private readonly _workspaceId: string | null,
    private readonly _createdAt: Date | null,
    private readonly _updatedAt: Date | null,
  ) {}

  /**
   * 新建一份草稿态帖子（缺省未发布）。不变量**只防御、不比边界严**：title 非空即放行，
   * 口径与 `@saas/contracts` 的 `createPostSchema.title`（`reqString`＝`z.string().min(1)`）一致——
   * HTTP 面已被 zod 先行拦截，此抛错仅护住非 HTTP 直调（承 `Money.fromMinorUnits` 同款「防御不可达」）。
   * @param input - 新建写意图（业务字段）。
   * @returns 草稿态 `Post` 实例（id/租户/时间戳为 `null`）。
   */
  static draft(input: PostDraftInput): Post {
    const { title } = input;
    if (typeof title !== 'string' || title.length < 1) {
      throw new Error('Post title must be a non-empty string.');
    }
    return new Post(null, title, input.content ?? null, false, null, null, null, null);
  }

  /**
   * 从持久层复原完整实例（不重复业务校验·信任仓储读出的行）。
   * @param state - 持久层复原输入（含技术字段）。
   * @returns 完整 `Post` 实例。
   */
  static restore(state: PostState): Post {
    return new Post(
      state.id,
      state.title,
      state.content,
      state.published,
      state.organizationId,
      state.workspaceId,
      state.createdAt,
      state.updatedAt,
    );
  }

  /** 主键（未落库为 `null`）。 */
  get id(): string | null {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get content(): string | null {
    return this._content;
  }

  get published(): boolean {
    return this._published;
  }

  /** 所属租户（ALS 盖章·未落库为 `null`）。 */
  get organizationId(): string | null {
    return this._organizationId;
  }

  /** 所属工作区（`null`＝未分区·可空是业务语义，非「未落库」）。 */
  get workspaceId(): string | null {
    return this._workspaceId;
  }

  get createdAt(): Date | null {
    return this._createdAt;
  }

  get updatedAt(): Date | null {
    return this._updatedAt;
  }

  /**
   * 发布（生命周期迁移·**纯转移**返回新实例·幂等：已发布则原样返回 `this`）。
   * @returns 已发布的新实例（或原 `this`）。
   */
  withPublished(): Post {
    return this._published ? this : this.withPublishedFlag(true);
  }

  /**
   * 撤回发布（生命周期迁移·**纯转移**返回新实例·幂等：未发布则原样返回 `this`）。
   * @returns 未发布的新实例（或原 `this`）。
   */
  withUnpublished(): Post {
    return this._published ? this.withPublishedFlag(false) : this;
  }

  /** 复制全字段、仅覆盖 `published`——保持实例不可变（不原地改 `_published`）。 */
  private withPublishedFlag(published: boolean): Post {
    return new Post(
      this._id,
      this._title,
      this._content,
      published,
      this._organizationId,
      this._workspaceId,
      this._createdAt,
      this._updatedAt,
    );
  }
}
