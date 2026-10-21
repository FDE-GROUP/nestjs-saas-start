/**
 * 对象键命名规则（真实领域策略·纯函数）。
 *
 * 从 `BaseStorageProvider.generateKey` 提取——所有存储通道一致采用
 * `YYYY/MM/DD/<id><ext>`。`id`（uuid）与 `now`（时间）由调用方注入，
 * 使本函数确定、可测、零外部依赖（不引 `node:path`/`uuid`）。
 */
export function buildStorageKey(filename: string, now: Date, id: string): string {
  // 与 `path.extname` 语义对齐：仅当点号不在首位时视为扩展名（`.env` 这类 dotfile 扩展名为空）。
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 ? filename.slice(dot) : '';
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}/${month}/${day}/${id}${ext}`;
}
