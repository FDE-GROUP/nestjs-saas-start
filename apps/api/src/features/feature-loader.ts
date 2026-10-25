import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Type } from '@nestjs/common';

/**
 * Feature 私有叠加层装配桩（module-odoo-rpc-frontend 切片 A · 公共仓常驻代码）。
 *
 * Why：第三方集成的产品源码住私有仓（开源裁剪裁决 2026-10-25），公共仓既不能静态
 * import 一个「可能不存在」的文件（build 闭合断裂），也不能靠远程 CI 兜底（本仓只跑
 * 本地 L1）——故运行期探测编译件/源件是否存在：在场即动态 `import()` 纳入 feature
 * 模块，缺席即空数组、应用照常装配。动态 import 说明符由运行期拼接（computed
 * specifier），tsc/swc 静态分析不可见，公共仓构建不被私有叠加层绑架——这正是方案
 * 「严格叠加·两态全绿」总原则的装配面物化。
 *
 * 顶层 await（ESM/ES2022 合法面）：导出已是解析后的类数组，app.module 展开同步、
 * 不依赖 Nest 对 `imports` 内 Promise 的解释行为。缺席分支零网络/零副作用。
 */
interface FeatureOverlay {
  /** 叠加层目录名（= `sync:features` 同步进 apps/api/src/features/ 的目录）。 */
  dir: string;
  /** 装配模块文件名（无扩展名）：约定落 `<dir>/api/<moduleFile>.ts`。 */
  moduleFile: string;
  /** 装配模块的导出类名（缺失即 fail-loud，拒绝静默跳过）。 */
  exportName: string;
}

/** 叠加层登记表：新增私有 feature = 此处登记一行（声明式，不逐模块特判）。 */
const OVERLAYS: readonly FeatureOverlay[] = [
  { dir: 'odoo-rpc-api', moduleFile: 'odoo-rpc-api.module', exportName: 'OdooRpcApiModule' },
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

/** `AppModule.imports` 直接展开；缺席态为空数组（两态全绿判据的机制根源）。 */
export const FEATURE_MODULES: readonly Type<unknown>[] = (
  await Promise.all(OVERLAYS.map((overlay) => resolveOverlay(overlay)))
).flat();
