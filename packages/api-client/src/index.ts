/**
 * `@saas/api-client` 汇面（前端 F1 typed 契约消费制品·换轨 B-6c/B-7）。
 * 三件：typed oRPC client · errors 单源（re-export @core）· envelope 契约。
 * 契约型不再来自 openapi codegen（旧 `client.ts`/`schema.d.ts` 已退役），改由 `@saas/api-contract` router 派生。
 */
export * from './envelope';
export * from './errors';
export * from './rpc-client';
