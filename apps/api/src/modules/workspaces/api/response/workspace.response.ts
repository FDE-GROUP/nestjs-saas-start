import type { WorkspaceReadModel } from '@core/saas-kit/modules/workspaces/application/read-models/workspace.read-model';
import type { Page } from '@core/saas-kit/shared-kernel/domain/pagination';
import { ApiProperty } from '@nestjs/swagger';
import type { WorkspacePage, WorkspaceView } from '@saas/contracts/index';

/**
 * workspaces 上下文响应契约（F1 甲①）——schema 源，纯文档面零运行时。
 * 真相源 = controller 实际返回类型 `WorkspaceReadModel`。漂移防线：见文件末编译期双向赋值锁
 * （interface 无运行时形，故以 tsc 结构恒等守，build 拓红），非 runtime 测。
 */
export class WorkspaceResponse {
  @ApiProperty({ description: 'UUIDv7。' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ description: '所属组织（仓储盖章）。' })
  organizationId!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    type: 'string',
    description: '实例属主；NULL/缺省 = 不属任何人（owner-column 片语义）。',
  })
  ownerId?: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

// —— 编译期双向对拍：response 类与真相源结构恒等，任一侧漂移则 tsc 红。——
const _wfwd: WorkspaceResponse = {} as WorkspaceReadModel;
const _wbwd: WorkspaceReadModel = {} as WorkspaceResponse;
void _wfwd;
void _wbwd;

/** offset 分页整体响应（`Page<WorkspaceReadModel>`）——整个分页对象裹入 data（无 meta 键）。 */
export class WorkspacePageResponse {
  @ApiProperty({ isArray: true, type: () => WorkspaceResponse })
  items!: WorkspaceResponse[];

  @ApiProperty({ description: '全量行数。' })
  total!: number;

  @ApiProperty({ description: '回显页宽。' })
  limit!: number;

  @ApiProperty({ description: '回显偏移。' })
  offset!: number;
}

const _wpfwd: WorkspacePageResponse = {} as Page<WorkspaceReadModel>;
const _wpbwd: Page<WorkspaceReadModel> = {} as WorkspacePageResponse;
void _wpfwd;
void _wpbwd;

// —— S7b 序列化契约锁：contracts zod 单源输出型 ≡ 真相源（缺字段红；多字段由 strip 剥落）。——
const _ws1: WorkspaceView = {} as WorkspaceReadModel;
const _ws2: WorkspaceReadModel = {} as WorkspaceView;
const _ws3: Page<WorkspaceReadModel> = {} as WorkspacePage;
void _ws1;
void _ws2;
void _ws3;
