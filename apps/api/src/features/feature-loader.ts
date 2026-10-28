import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Type } from '@nestjs/common';

/**
 * Feature 叠加层装配桩（module-odoo-rpc-frontend 切片 A · 本公共仓常驻代码）。
 *
 * Why：第三方集成（Odoo 对接件）住 `apps/api/src/features/` 专属区（开源边界重划
 * 2026-10-28 后已并入本公共仓常驻·非私有同步副本），但仍靠运行期探测将 feature 模块
 * 纳入装配：在场即动态 `import()`，缺席即空数组、应用照常装配。动态 import 说明符由
 * 运行期拼接（computed specifier），tsc/swc 静态分析不可见——装配面与具体叠加层解耦，
 * 新增/移除叠加层不绑架主应用构建闭合。这正是「严格叠加·构建解耦」原则的装配面物化
 * （开源边界重划 2026-10-28 后 features 常驻本仓·单态在场）。
 *
 * 顶层 await（ESM/ES2022 合法面）：导出已是解析后的类数组，app.module 展开同步、
 * 不依赖 Nest 对 `imports` 内 Promise 的解释行为。缺席分支零网络/零副作用。
 */
interface FeatureOverlay {
  /** 叠加层目录名（= `apps/api/src/features/` 下的常驻目录）。 */
  dir: string;
  /** 装配模块文件名（无扩展名）：约定落 `<dir>/api/<moduleFile>.ts`。 */
  moduleFile: string;
  /** 装配模块的导出类名（缺失即 fail-loud，拒绝静默跳过）。 */
  exportName: string;
}

/** 叠加层登记表：新增私有 feature = 此处登记一行（声明式，不逐模块特判）。 */
const OVERLAYS: readonly FeatureOverlay[] = [
  { dir: 'odoo-rpc-api', moduleFile: 'odoo-rpc-api.module', exportName: 'OdooRpcApiModule' },
  {
    dir: 'odoo-provisioning',
    moduleFile: 'odoo-provisioning.module',
    exportName: 'OdooProvisioningModule',
  },
];

async function resolveOverlay(overlay: FeatureOverlay): Promise<Type<unknown>[]> {
  // 源树（vitest/dev 直跑）为 .ts、编译产物（dist）为 .js——两态各探测一次，缺席分支零成本。
  for (const ext of ['.js', '.ts']) {
    const specifier = `./${overlay.dir}/api/${overlay.moduleFile}${ext}`;
    if (!existsSync(fileURLToPath(new URL(specifier, import.meta.url)))) {
      continue;
    }
    const mod = (await import(specifier)) as Record<string, unknown>;
    if (!(overlay.exportName in mod)) {
      throw new Error(
        `feature 叠加层 ${overlay.dir} 缺导出 ${overlay.exportName}——装配面 fail-loud`,
      );
    }
    return [mod[overlay.exportName] as Type<unknown>];
  }
  return [];
}

/** `AppModule.imports` 直接展开；在场即解析类数组，缺席分支返回空数组（构建解耦的机制根源）。 */
export const FEATURE_MODULES: readonly Type<unknown>[] = (
  await Promise.all(OVERLAYS.map((overlay) => resolveOverlay(overlay)))
).flat();
