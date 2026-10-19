import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * core 纯度守卫（架构精度修宪 S2 · P1 可执行化）——复用 users 聚合纯正则锁范式并升格到 kit 级。
 *
 * 扫描面 = `modules/**` + `shared-kernel/**`（kit 的领域/应用层）；**适配器角色文件按命名豁免**
 * （`*.guard.ts` / `*.decorator.ts` / `*.middleware.ts`——它们是 kit 自带的 Nest HTTP 接缝，
 * 合法抛 HTTP/用 Nest 契约；横切目录 tenancy/authorization/platform 同属接缝面不在扫描面）。
 *
 * 两把锁：
 * ① `@nestjs/common` import 收缩到 **DI 最小面**（Inject/Injectable/SetMetadata/Optional/
 *    forwardRef/Logger）——框架渗入领域/应用即红；
 * ② `HttpException|HttpStatus` 字面**零出现**——HTTP 语义翻译永远归消费点/适配器（P1）。
 */

const CORE_SRC = resolve(fileURLToPath(import.meta.url), '..');
const SCAN_ROOTS = ['modules', 'shared-kernel'];
const ADAPTER_ROLE = /\.(guard|decorator|middleware)\.ts$/;
const DI_ALLOWLIST = new Set(['Inject', 'Injectable', 'SetMetadata', 'Optional', 'forwardRef', 'Logger']);

function walk(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      walk(abs, acc);
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts')) {
      acc.push(relative(CORE_SRC, abs).split('\\').join('/'));
    }
  }
}

function scannedFiles(): string[] {
  const acc: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(CORE_SRC, root), acc);
  return acc.filter((rel) => !ADAPTER_ROLE.test(rel));
}

/** 解析单文件所有 `from '@nestjs/common'` 导入的标识符集合。 */
function nestCommonIdentifiers(source: string): Set<string> {
  const ids = new Set<string>();
  for (const m of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@nestjs\/common'/g)) {
    for (const part of m[1].split(',')) {
      const id = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim();
      if (id) ids.add(id);
    }
  }
  return ids;
}

describe('core 纯度守卫（S2 · P1/P2 可执行化）', () => {
  const files = scannedFiles();
  it('扫描面非空（防根目录漂移致空集假绿）', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('@nestjs/common import ⊆ DI 最小面（领域/应用零框架渗入）', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const ids = nestCommonIdentifiers(readFileSync(join(CORE_SRC, rel), 'utf8'));
      const illegal = [...ids].filter((id) => !DI_ALLOWLIST.has(id));
      if (illegal.length > 0) offenders.push(`${rel}: ${illegal.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('HttpException/HttpStatus 在领域/应用面零出现（HTTP 翻译归适配器）', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      if (/HttpException|HttpStatus/.test(readFileSync(join(CORE_SRC, rel), 'utf8'))) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
