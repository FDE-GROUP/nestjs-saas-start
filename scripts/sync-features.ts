// Feature 私有叠加层同步/对拍工具（odoo-saas-start docs/plans/module-odoo-rpc-frontend.md 切片 A）。
//
// 方向：私有仓 `odoo/saas-addons/server/features/<name>/`（源码真源）→ 公共仓工作树
// `apps/api/src/features/<name>/`（未追踪副本·.gitignore 防线）。副本供 tsc/swc/Biome/Vitest
// 天然覆盖（真实目录·F0 实证软链不被遍历故弃软链方案）。
//
// 两态语义：私有 checkout 缺席（公共机器）→ 源目录不存在 → no-op EXIT 0（严格叠加·缺席态
// 全绿）；`--check` 模式做「真源 ↔ 副本」哈希对拍，漂移 fail-loud——堵「改了私有忘同步」
// 的静默腐烂（方案 §6-1 同步新鲜度风险的机制解）。
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const SRC_ROOT = join(REPO_ROOT, 'odoo/saas-addons/server/features');
const DST_ROOT = join(REPO_ROOT, 'apps/api/src/features');
const MANIFEST = '.overlay-manifest.json';

// 与 apps/api/src/features/feature-loader.ts 的 OVERLAYS 登记表同源（新增叠加层两处同补）。
const OVERLAY_NAMES = ['odoo-rpc-api', 'odoo-provisioning'];

/** 递归收集「相对路径 → sha256」；排除清单外的所有文件（manifest 自身不参与对拍）。 */
function hashTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.name !== MANIFEST) {
        out[relative(root, abs).replaceAll('\\', '/')] = createHash('sha256')
          .update(readFileSync(abs))
          .digest('hex');
      }
    }
  };
  walk(root);
  return out;
}

function syncOne(name: string): boolean {
  const src = join(SRC_ROOT, name);
  const dst = join(DST_ROOT, name);
  if (!existsSync(src)) {
    console.log(`· ${name}: 私有真源缺席（no-op）`);
    return true;
  }
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true });
  writeFileSync(
    join(dst, MANIFEST),
    `${JSON.stringify({ syncedAt: new Date().toISOString(), hashes: hashTree(src) }, null, 2)}\n`,
  );
  console.log(`✓ ${name}: 已同步 → ${relative(REPO_ROOT, dst)}`);
  return true;
}

function checkOne(name: string): boolean {
  const src = join(SRC_ROOT, name);
  const dst = join(DST_ROOT, name);
  const srcExists = existsSync(src);
  const dstExists = existsSync(dst);
  if (!srcExists && !dstExists) {
    console.log(`· ${name}: 两态皆缺席（OK）`);
    return true;
  }
  if (srcExists && !dstExists) {
    console.error(`✗ ${name}: 真源在场但副本缺失——请 pnpm run sync:features`);
    return false;
  }
  if (!srcExists && dstExists) {
    console.error(`✗ ${name}: 真源已不存在但副本残留——陈旧副本，删 ${relative(REPO_ROOT, dst)}`);
    return false;
  }
  const a = JSON.stringify(hashTree(src as string));
  const b = JSON.stringify(hashTree(dst as string));
  if (a !== b) {
    console.error(`✗ ${name}: 副本与真源漂移——请 pnpm run sync:features`);
    return false;
  }
  console.log(`✓ ${name}: 副本与真源哈希一致`);
  return true;
}

const mode = process.argv.slice(2).includes('--check') ? 'check' : 'sync';
const results = OVERLAY_NAMES.map((name) => (mode === 'check' ? checkOne(name) : syncOne(name)));
if (results.some((okFlag) => !okFlag)) {
  console.error(
    mode === 'check' ? 'feature overlays check FAILED' : 'feature overlays sync FAILED',
  );
  process.exit(1);
}
// 全部缺席/全部一致即 EXIT 0——缺席态公共仓零负担（两态全绿判据）。
if (mode === 'sync' && results.length === 0) {
  console.log('· 无已登记叠加层');
}
