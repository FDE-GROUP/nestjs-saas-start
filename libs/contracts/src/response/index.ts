/**
 * 响应面契约单源 barrel（S7b·白名单序列化）。
 * 与请求面同理零依赖 @core；本目录 schema 专供官方 `StandardSchemaSerializerInterceptor`
 * 经 `@SerializeOptions({schema})` 消费——默认 strip 即白名单（未声明字段/PII 剥落不出线）。
 */
export * from './authorization';
export * from './health';
export * from './mcp';
export * from './oauth-sso';
export * from './organizations';
export * from './page';
export * from './payment';
export * from './platform';
export * from './posts';
export * from './storage';
export * from './subscriptions';
export * from './tenants';
export * from './users';
export * from './workspaces';
