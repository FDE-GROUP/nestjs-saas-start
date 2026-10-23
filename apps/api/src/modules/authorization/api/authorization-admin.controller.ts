import { Can } from '@core/saas-kit/authorization/can.decorator';
import { TenantPermissionGuard } from '@core/saas-kit/authorization/tenant-permission.guard';
import { TenantScopeGuard } from '@core/saas-kit/tenancy/tenant-scope.guard';
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
  organizationRoleGrantViewSchema,
  organizationRoleViewSchema,
  type RenameRole,
  type RevokeRolePermission,
  renameRoleSchema,
  revokeRolePermissionSchema,
} from '@saas/contracts/index';
import {
  ApiEnvelope,
  ApiErrorResponse,
  apiEnvelopeShape,
  apiError,
  apiOkArray,
} from '../../../common/contracts/api-contracts';
import { OrganizationRbacAdminService } from '../application/organization-rbac-admin.service';
import type {
  OrganizationRoleGrantView,
  OrganizationRoleView,
} from '../domain/repositories/organization-rbac.repository';
import {
  OrganizationRoleGrantViewResponse,
  OrganizationRoleViewResponse,
} from './response/role.response';

/**
 * 角色/授权**管理门面**（module-rbac-dynamic-roles §2.5·S3·甲裁自建角色 + 丁裁随片授权面）。
 *
 * 授权在我·数据在 DB：每端点声明 `@Can(<动作>, 'Role'|'RoleGrant')`，由 `TenantPermissionGuard`
 * 携 ALS 角色经 CASL（规则源 = 本租户 DB grant 行）裁决；通过后委派 `OrganizationRbacAdminService`
 * 落库（写侧过 domain 策略闸 + 同通道审计行 + 写后失效投影缓存）。BA 内置 create-role/roles 端点
 * 维持封堵（甲裁不代建→本片自建），本门面是租户差异化授权策略的唯一入口。
 *
 * `@Can` 落点与 seed 一致：owner/admin 持 `Role`(create/read/update/delete) + `RoleGrant`
 * (create/read/delete)，member 无 → 非管理员请求由守卫 403（fail-closed）。
 */
@ApiExtraModels(
  ApiEnvelope,
  ApiErrorResponse,
  OrganizationRoleViewResponse,
  OrganizationRoleGrantViewResponse,
)
@ApiTags('tenants')
@Controller('tenants/roles')
@UseGuards(TenantScopeGuard, TenantPermissionGuard)
export class AuthorizationAdminController {
  constructor(
    @Inject(OrganizationRbacAdminService) private readonly rbac: OrganizationRbacAdminService,
  ) {}

  @Get()
  @Can('read', 'Role')
  @SerializeOptions({ schema: organizationRoleViewSchema })
  @ApiOperation({ summary: 'List roles of the active tenant (system + custom)' })
  @ApiResponse(apiOkArray(OrganizationRoleViewResponse, 'Role views.'))
  @ApiResponse(apiError(403, 'CASL deny (no Role read).'))
  listRoles(): Promise<OrganizationRoleView[]> {
    return this.rbac.listRoles();
  }

  @Post()
  @Can('create', 'Role')
  @HttpCode(HttpStatus.OK)
  @SerializeOptions({ schema: organizationRoleViewSchema })
  @ApiOperation({ summary: 'Create a custom role (owner/admin)' })
  @ApiResponse(
    apiEnvelopeShape(OrganizationRoleViewResponse, { description: 'Created role view.' }),
  )
  @ApiResponse(apiError(400, 'Invalid/reserved role key.'))
  @ApiResponse(apiError(409, 'Role key already exists.'))
  createRole(@Body({ schema: createRoleSchema }) dto: CreateRole): Promise<OrganizationRoleView> {
    return this.rbac.createRole(dto.key, dto.name);
  }

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

  @Get('grants')
  @Can('read', 'RoleGrant')
  @SerializeOptions({ schema: organizationRoleGrantViewSchema })
  @ApiOperation({ summary: 'List grant rows of a role (echo checked state)' })
  @ApiResponse(
    apiOkArray(OrganizationRoleGrantViewResponse, 'Grant views (subject/action/conditions).'),
  )
  @ApiResponse(apiError(404, 'Role not found.'))
  listGrants(@Query('roleKey') roleKey?: string): Promise<OrganizationRoleGrantView[]> {
    if (!roleKey) {
      throw new BadRequestException('roleKey query param is required');
    }
    return this.rbac.getGrants(roleKey);
  }

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
