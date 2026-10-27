import { AuthorizationGuard } from '@core/saas-kit/authorization/authorization.guard';
import { Can } from '@core/saas-kit/authorization/can.decorator';
import { TenantIsolationGuard } from '@core/saas-kit/tenant-isolation/tenant-isolation.guard';
import {
  BadRequestException,
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
import { ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  type CreateRole,
  createRoleSchema,
  type DeleteRole,
  deleteRoleSchema,
  type GrantRolePermission,
  grantRolePermissionSchema,
  type RenameRole,
  type RevokeRolePermission,
  renameRoleSchema,
  revokeRolePermissionSchema,
  tenantRoleGrantViewSchema,
  tenantRoleViewSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
  apiOkArray,
} from '../../../common/contracts/api-contracts';
import { TenantRbacAdminService } from '../application/organization-rbac-admin.service';
import type {
  TenantRoleGrantView,
  TenantRoleView,
} from '../domain/repositories/organization-rbac.repository';
import { TenantRoleGrantViewResponse, TenantRoleViewResponse } from './response/role.response';

/**
 * 角色/授权**管理门面**端点（module-rbac-dynamic-roles §2.5·S3·甲裁自建角色 + 丁裁随片授权面）。
 *
 * @remarks
 * 授权在我·数据在 DB：每端点声明 `@Can(<动作>, 'Role'|'RoleGrant')`，由 `AuthorizationGuard`
 * 携 ALS 角色经 CASL（规则源 = 本租户 DB grant 行）裁决；通过后委派 `TenantRbacAdminService`
 * 落库（写侧过 domain 策略闸 + 同通道审计行 + 写后失效投影缓存）。BA 内置 create-role/roles 端点
 * 维持封堵（甲裁不代建→本片自建），本门面是租户差异化授权策略的唯一入口。
 *
 * `@Can` 落点与 seed 一致：owner/admin 持 `Role`(create/read/update/delete) + `RoleGrant`
 * (create/read/delete)，member 无 → 非管理员请求由守卫 403（fail-closed）。
 * @public
 */
@ApiExtraModels(ApiEnvelope, ApiErrorResponse, TenantRoleViewResponse, TenantRoleGrantViewResponse)
@ApiTags('organizations')
@Controller('organizations/roles')
@UseGuards(TenantIsolationGuard, AuthorizationGuard)
export class AuthorizationAdminController {
  constructor(@Inject(TenantRbacAdminService) private readonly rbac: TenantRbacAdminService) {}

  /**
   * 列出活动租户全部角色（系统 + 自定义）。
   * @returns 角色读模型列表。
   */
  @Get()
  @Can('read', 'Role')
  @SerializeOptions({ schema: tenantRoleViewSchema })
  @ApiOperation({ summary: 'List roles of the active organization (system + custom)' })
  @ApiResponse(apiOkArray(TenantRoleViewResponse, 'Role views.'))
  @ApiResponse(apiError(403, 'CASL deny (no Role read).'))
  listRoles(): Promise<TenantRoleView[]> {
    return this.rbac.listRoles();
  }

  /**
   * 创建自定义角色（仅 owner/admin）。
   * @param dto - 创建载荷（key/name）。
   * @returns 创建后的角色读模型。
   */
  @Post()
  @Can('create', 'Role')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: tenantRoleViewSchema })
  @ApiOperation({ summary: 'Create a custom role (owner/admin)' })
  @ApiResponse(apiEnvelopeShape(TenantRoleViewResponse, { description: 'Created role view.' }))
  @ApiResponse(apiError(400, 'Invalid/reserved role key.'))
  @ApiResponse(apiError(409, 'Role key already exists.'))
  createRole(@Body({ schema: createRoleSchema }) dto: CreateRole): Promise<TenantRoleView> {
    return this.rbac.createRole(dto.key, dto.name);
  }

  /**
   * 自定义角色改名（系统角色屏）。
   * @param dto - 改名载荷（key/name）。
   */
  @Post('rename')
  @Can('update', 'Role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rename a custom role (system roles protected)' })
  @ApiResponse({ status: 200, description: 'Renamed.' })
  @ApiResponse(apiError(404, 'Role not found.'))
  @ApiResponse(apiError(409, 'System role protected.'))
  async renameRole(@Body({ schema: renameRoleSchema }) dto: RenameRole): Promise<void> {
    await this.rbac.renameRole(dto.key, dto.name);
  }

  /**
   * 删除自定义角色（授权行级联销；系统角色屏）。
   * @param dto - 删除载荷（key）。
   */
  @Post('delete')
  @Can('delete', 'Role')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a custom role (grants cascade; system roles protected)' })
  @ApiResponse({ status: 200, description: 'Deleted.' })
  @ApiResponse(apiError(404, 'Role not found.'))
  @ApiResponse(apiError(409, 'System role protected.'))
  async deleteRole(@Body({ schema: deleteRoleSchema }) dto: DeleteRole): Promise<void> {
    await this.rbac.deleteRole(dto.key);
  }

  /**
   * 列出某角色的授权行（回显勾选态）。
   * @param roleKey - 查询参数：目标角色 key（缺失 → 400）。
   * @returns 授权行读模型列表。
   *
   * @throws {BadRequestException} 缺少 roleKey 查询参数时。
   */
  @Get('grants')
  @Can('read', 'RoleGrant')
  @SerializeOptions({ schema: tenantRoleGrantViewSchema })
  @ApiOperation({ summary: 'List grant rows of a role (echo checked state)' })
  @ApiResponse(apiOkArray(TenantRoleGrantViewResponse, 'Grant views (subject/action/conditions).'))
  @ApiResponse(apiError(404, 'Role not found.'))
  listGrants(@Query('roleKey') roleKey?: string): Promise<TenantRoleGrantView[]> {
    if (!roleKey) {
      throw new BadRequestException('roleKey query param is required');
    }
    return this.rbac.getGrants(roleKey);
  }

  /**
   * 为角色新增授权格（同格多条件行 = OR 并集）。
   * @param dto - 授权载荷（roleKey/subject/action/conditions）。
   */
  @Post('grants')
  @Can('create', 'RoleGrant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grant a permission cell to a role (multi-condition rows = OR union)' })
  @ApiResponse({ status: 200, description: 'Granted.' })
  @ApiResponse(apiError(400, 'Invalid conditions (whitelist-only).'))
  @ApiResponse(apiError(404, 'Role not found.'))
  @ApiResponse(apiError(409, 'Duplicate grant.'))
  async grant(
    @Body({ schema: grantRolePermissionSchema }) dto: GrantRolePermission,
  ): Promise<void> {
    await this.rbac.grant(dto.roleKey, {
      subject: dto.subject,
      action: dto.action,
      conditions: dto.conditions ?? null,
    });
  }

  /**
   * 撤权（conditions 缺省 = 整 subject 级行；传对象 = 精确撤单条件行）。
   * @param dto - 撤权载荷（roleKey/subject/action/conditions）。
   */
  @Post('grants/revoke')
  @Can('delete', 'RoleGrant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke a grant (conditions null = whole-subject row; object = exact row)',
  })
  @ApiResponse({ status: 200, description: 'Revoked.' })
  @ApiResponse(apiError(404, 'Role or matching grant not found.'))
  async revoke(
    @Body({ schema: revokeRolePermissionSchema }) dto: RevokeRolePermission,
  ): Promise<void> {
    await this.rbac.revoke(dto.roleKey, dto.subject, dto.action, dto.conditions ?? null);
  }
}
