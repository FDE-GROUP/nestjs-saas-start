import './load-env';

import { mkdirSync, writeFileSync } from 'node:fs';

import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod';
import { appContractRouter } from '@saas/api-contract/index';
import * as yaml from 'js-yaml';

/**
 * OpenAPI 文档面导出入口（承换轨评审 M4·`module-orpc-openapi-docgen` 切片 A）。
 *
 * @remarks
 * **契约驱动·DB-free·无 Nest boot**：文档面从公共契约 router
 * `appContractRouter`（`@saas/api-contract`·`oc.router(PUBLIC_APP_ROUTER_SPEC)`·56 公共叶）经
 * `@orpc/openapi` 的 `OpenAPIGenerator` 派生——各 procedure 的 `openapi({ method, path,
 * successStatus, summary })` meta 给路由/方法/状态码，`.input`/`.output` zod（`@saas/contracts`
 * 单源）给请求/响应 schema。
 *
 * 换轨旧路（`SwaggerModule.createDocument(app)` 反射 controller）在写面迁 zod 契约后认不到
 * schema（实测 components 3.7 塌、写路由 requestBody/响应掏空）；本路令文档面与契约单源重新对齐。
 *
 * `ZodToJsonSchemaConverter`（`@orpc/zod`·同 pin beta.44）为必备：oRPC 默认转换器遇
 * `z.date()`/`z.custom()` 会把整个响应 schema 崩成空 content（实测·一字段毁全身）；本转换器把
 * `z.date()`→`{type:string,format:date-time}`、`z.custom()`→`{}`，忠实回填含日期字段的响应面。
 *
 * **定位**：生成态文档面·非契约 SSOT·不入字节对拍闸（契约恒等仍由 `verify:orpc-contract` 覆盖闸守，
 * 见 `specs/architecture` §对外接口面）。feature 叶（mcp/odoo）不入公共 router，故天然不出现在本文档面。
 */
async function generate(): Promise<void> {
  const generator = new OpenAPIGenerator({
    converters: [new ZodToJsonSchemaConverter()],
  });

  const apiPrefix = process.env.API_PREFIX ?? 'api';
  const apiVersion = process.env.API_VERSION ?? '1';

  const document = await generator.generate(appContractRouter, {
    // 与旧提交态/OpenAPI 生态兼容的 3.1（生成核为 3.2 后向下转换）。
    version: '3.1.0',
    base: {
      info: {
        title: process.env.APP_NAME ?? 'API Documentation',
        description:
          process.env.APP_DESCRIPTION ??
          'oRPC 契约驱动的公共对外 HTTP 面（生成态文档面·非契约 SSOT）。',
        version: process.env.API_DOC_VERSION ?? '1.0.0',
      },
      // 运行时 REST 前缀 = `/{prefix}/v{version}`（main.ts setGlobalPrefix + URI versioning 镜像）；
      // 契约 meta.path 为绝对段（如 /workspaces），base path 交由 servers 承载。
      servers: [{ url: `/${apiPrefix}/v${apiVersion}` }],
    },
  });

  mkdirSync('openapi', { recursive: true });
  // oRPC 生成的文档节点可能携原型/类实例，js-yaml 只接 plain object——OpenAPI 本是纯数据，
  // 经 JSON round-trip 归一后再 dump（与 JSON 序列化产物一致·无损）。
  const plainDocument = JSON.parse(JSON.stringify(document)) as {
    paths?: Record<string, unknown>;
    components?: { schemas?: Record<string, unknown> };
  };
  writeFileSync('openapi/openapi.yaml', yaml.dump(plainDocument));

  const pathCount = Object.keys(plainDocument.paths ?? {}).length;
  const schemaCount = Object.keys(plainDocument.components?.schemas ?? {}).length;
  console.log(
    `[OpenApiCodegen] OpenAPI spec exported to openapi/openapi.yaml (${pathCount} paths, ${schemaCount} components)`,
  );
}

generate().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[OpenApiCodegen] Failed to generate OpenAPI spec: ${message}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
