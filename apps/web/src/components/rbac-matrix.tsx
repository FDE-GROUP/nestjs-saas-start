/**
 * RBAC 权限矩阵基元（前端 F3 · module-frontend-rbac-admin §2.2/§2.3）。
 *
 * 6 subject x 5 action = 30 cell 扁平 grid（待裁点②甲·一屏可见）。勾选 = whole-subject 授予
 * （conditions 省略·待裁点③甲），取消 = 撤整 subject 级行。toggle 即调 mutation（待裁点⑤甲）。
 *
 * 枚举词汇单一 SSOT（待裁点④甲）：subject/action 联合类型直取 @saas/api-client schema，
 * 运行时数组以 `readonly TenantSubject[]` 注解约束元素合法——后端枚举新增值会在此拓红（编译期）。
 */
import type { components, paths } from '@saas/api-client';

/**
 * S6 请求契约翻转后 `GrantRolePermissionDto` 具名组件已 inline 进 path、不再列于 `components.schemas`；
 * subject/action 联合遂由授予端点请求体派生（后端枚举改动会在此即时拓红·编译期）。
 */
type GrantRequestBody =
  paths['/api/v1/tenants/roles/grants']['post']['requestBody']['content']['application/json'];
export type TenantSubject = GrantRequestBody['subject'];
export type TenantAction = GrantRequestBody['action'];
export type TenantRoleGrantView = components['schemas']['TenantRoleGrantViewResponse'];

export const SUBJECTS: readonly TenantSubject[] = [
  'Organization',
  'Member',
  'Invitation',
  'Workspace',
  'Role',
  'RoleGrant',
];

export const ACTIONS: readonly TenantAction[] = ['create', 'read', 'update', 'delete', 'cancel'];

const SUBJECT_LABELS: Record<TenantSubject, string> = {
  Organization: '组织',
  Member: '成员',
  Invitation: '邀请',
  Workspace: '工作区',
  Role: '角色',
  RoleGrant: '授权',
};

const ACTION_LABELS: Record<TenantAction, string> = {
  create: '新建',
  read: '查看',
  update: '修改',
  delete: '删除',
  cancel: '取消',
};

/** cell 唯一键（subject:action）。 */
export function cellKey(subject: TenantSubject, action: TenantAction): string {
  return `${subject}:${action}`;
}

/**
 * 已授予判定：存在一条 conditions==null 的 whole-subject 行即视为勾选。
 * 本片仅管理 whole-subject 行（instance-level conditions 行不在此面呈现·待裁点③甲隔离）。
 */
export function grantedCellSet(grants: readonly TenantRoleGrantView[]): Set<string> {
  const set = new Set<string>();
  for (const g of grants) {
    if (g.conditions == null) set.add(cellKey(g.subject, g.action));
  }
  return set;
}

export interface RbacMatrixProps {
  grants: readonly TenantRoleGrantView[];
  /** 当前正在提交中的 cell 键（pending 态灰格·待裁点⑤甲）。 */
  pendingCell: string | null;
  /** 整表禁用（如加载/无权操作）。 */
  disabled?: boolean;
  onToggle: (subject: TenantSubject, action: TenantAction, currentlyGranted: boolean) => void;
}

export function RbacMatrix({ grants, pendingCell, disabled, onToggle }: RbacMatrixProps) {
  const granted = grantedCellSet(grants);
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <th className="py-2 pr-4 font-medium">主体 \ 动作</th>
          {ACTIONS.map((a) => (
            <th key={a} className="py-2 px-2 text-center font-medium">
              {ACTION_LABELS[a]}
              <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">({a})</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SUBJECTS.map((s) => (
          <tr key={s} className="border-b border-slate-100 dark:border-slate-800">
            <td className="py-2 pr-4 text-slate-800 dark:text-slate-100">
              {SUBJECT_LABELS[s]}
              <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">({s})</span>
            </td>
            {ACTIONS.map((a) => {
              const key = cellKey(s, a);
              const checked = granted.has(key);
              const pending = pendingCell === key;
              return (
                <td key={key} className="py-2 px-2 text-center">
                  <input
                    type="checkbox"
                    aria-label={`${SUBJECT_LABELS[s]} ${ACTION_LABELS[a]}`}
                    checked={checked}
                    disabled={disabled || pending}
                    onChange={() => onToggle(s, a, checked)}
                    className="h-4 w-4 cursor-pointer accent-slate-800 disabled:opacity-40 dark:accent-slate-200"
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
