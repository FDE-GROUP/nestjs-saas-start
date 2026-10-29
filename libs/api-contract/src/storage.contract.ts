/**
 * storage 域 procedure 契约（`@saas/api-contract`·换轨 WP-E/#2 契约先行）。
 *
 * @remarks
 * 删除文件 / 取签名 URL 两面（路径参 `:key`〔+ query `expiresIn`〕经非-strict 合并 input 入单一对象·
 * 出线 `.output` 承旧 `@SerializeOptions` 白名单）。**upload 单文件 multipart 保留 REST**（原始流·非
 * JSON-RPC 形·plan §2-1 传输入口保留）——不在本契约面。守卫/handler 留 apps/api。
 */
import {
  storageDeleteInputSchema,
  storageDeleteSchema,
  storageUrlInputSchema,
  storageUrlSchema,
} from '@saas/contracts/index';
import { oc, openapi } from './base';

export const storageDeleteMeta = openapi({
  method: 'DELETE',
  path: '/storage/:key',
  summary: 'Delete a file',
});
export const storageUrlMeta = openapi({
  method: 'GET',
  path: '/storage/:key/url',
  summary: 'Get a signed URL for a file',
});

export const storageDeleteContract = oc
  .input(storageDeleteInputSchema)
  .output(storageDeleteSchema)
  .meta(storageDeleteMeta);
export const storageUrlContract = oc
  .input(storageUrlInputSchema)
  .output(storageUrlSchema)
  .meta(storageUrlMeta);
