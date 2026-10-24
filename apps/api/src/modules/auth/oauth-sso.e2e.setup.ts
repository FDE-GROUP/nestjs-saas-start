/**
 * SSO 隐式流 e2e 的 client 注册表预置（切片 E·副作用先行导入）：
 * `config/envs/default.ts` 于**模块导入期**静态读 `process.env.SSO_OAUTH_CLIENTS`
 * （`parseSsoClients(process.env...)` 在对象字面量求值时执行），故须在测试文件的 import 链
 * 触达 `default.ts` 之前把 env 就位。ESM 按 import 声明顺序求值——本模块无依赖、被置于测试
 * 文件**首条 import**，其副作用即早于所有后续（含经 `AppModule`→config 的）模块求值。
 */
process.env.SSO_OAUTH_CLIENTS = JSON.stringify([
  {
    clientId: 'e2e-odoo',
    redirectUris: ['http://localhost:8069/odoo/oauth2/callback'],
    audience: 'e2e-odoo-aud',
  },
]);

export {};
