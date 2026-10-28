import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '../../../config/config.service';

/** Odoo `search_read` 单行原始形（上游缺失字段以 False/undefined 出现，由上层归一）。 */
export type OdooRow = Record<string, unknown> & { id: number };

interface JsonRpcEnvelope<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code?: number; message?: string; data?: { message?: string } };
}

/**
 * Odoo JSON-RPC 只读客户端（`/jsonrpc` 经典面·原生 fetch·零新依赖）。
 *
 * 活体对拍裁据（2026-10-25·odoo:20 CE demo 实例）：
 * - `/jsonapi`（17+ 新面）在未装对应模块的 CE 实例返回 404 → 走 `/jsonrpc`（恒可用面）；
 * - `common.authenticate(db, login, api_key)` 接受 API key 顶替 password 并返回 uid；
 * - `object/execute_kw` 服务端强校验 uid 与 key 归属一致（错配 AccessDenied），
 *   故本客户端 uid 一律来自 authenticate，不做手工配置；
 * - API key 由 Odoo `res.users.apikeys`（scope=`rpc`）签发，禁明文密码——见方案 §5-B。
 *
 * 鉴权面 fail-closed：`ODOO_*` 四键缺一即 503（ServiceUnavailable），上游 `error` 信封
 * 即抛（不吞错、不把上游畸形数据透传给契约层）。
 */
@Injectable()
export class OdooJsonClient {
  private readonly logger = new Logger(OdooJsonClient.name);
  private uid: number | null = null;
  private seq = 0;

  // 铁律：被注入类值导入 + 显式 @Inject（类即 token）。
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  /** 执行一次 `execute_kw`（model/method/args/kwargs 原样透传·只由本 feature 白名单调用点消费）。 */
  async executeKw<T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown>,
  ): Promise<T> {
    const { db, key } = this.credentials();
    const uid = await this.resolveUid(db, key);
    const body = {
      jsonrpc: '2.0',
      id: ++this.seq,
      method: 'call',
      params: {
        service: 'object',
        method: 'execute_kw',
        args: [db, uid, key, model, method, args, kwargs],
      },
    };
    return this.call<T>(body, `${model}.${method}`);
  }

  /** 便捷面：search_count(domain·可选公司上下文)。 */
  searchCount(
    model: string,
    domain: unknown[],
    context?: Record<string, unknown>,
  ): Promise<number> {
    return this.executeKw<number>(model, 'search_count', [domain], context ? { context } : {});
  }

  /** 便捷面：search_read(domain, fields, limit·可选公司上下文入 kwargs)。 */
  searchRead(
    model: string,
    domain: unknown[],
    fields: string[],
    limit: number,
    context?: Record<string, unknown>,
  ): Promise<OdooRow[]> {
    return this.executeKw<OdooRow[]>(model, 'search_read', [domain], {
      fields,
      limit,
      ...(context ? { context } : {}),
    });
  }

  private credentials(): { db: string; key: string } {
    const db = this.config.get<string>('ODOO_DB');
    const key = this.config.get<string>('ODOO_API_KEY');
    if (!db || !key) {
      throw new ServiceUnavailableException('Odoo 叠加层未配置（缺 ODOO_DB/ODOO_API_KEY）');
    }
    return { db, key };
  }

  private async resolveUid(db: string, key: string): Promise<number> {
    if (this.uid !== null) return this.uid;
    const login = this.config.get<string>('ODOO_LOGIN');
    if (!login) throw new ServiceUnavailableException('Odoo 叠加层未配置（缺 ODOO_LOGIN）');
    const uid = await this.call<number>(
      {
        jsonrpc: '2.0',
        id: ++this.seq,
        method: 'call',
        params: { service: 'common', method: 'authenticate', args: [db, login, key, {}] },
      },
      'common.authenticate',
    );
    // 20 面 authenticate 失败返回 false（error 信封缺席）——显式转 503，不让布尔混进 uid。
    if (typeof uid !== 'number' || uid <= 0) {
      throw new ServiceUnavailableException('Odoo 鉴权失败（API key 无效或账号不可用）');
    }
    this.logger.log(`Odoo 服务账号鉴权通过（uid=${uid}）`);
    this.uid = uid;
    return uid;
  }

  private async call<T>(body: unknown, label: string): Promise<T> {
    const base = this.config.get<string>('ODOO_BASE_URL');
    if (!base) throw new ServiceUnavailableException('Odoo 叠加层未配置（缺 ODOO_BASE_URL）');
    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/$/, '')}/jsonrpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.warn(`Odoo 上游不可达（${label}）：${(err as Error).message}`);
      throw new ServiceUnavailableException('Odoo 上游服务不可达');
    }
    if (!res.ok) {
      throw new ServiceUnavailableException(`Odoo 上游返回 HTTP ${res.status}（${label}）`);
    }
    const envelope = (await res.json()) as JsonRpcEnvelope<T>;
    if (envelope.error) {
      const message = envelope.error.data?.message ?? envelope.error.message ?? '未知上游错误';
      this.logger.warn(`Odoo 上游错误（${label}）：${message}`);
      throw new BadRequestException(`Odoo 上游调用失败（${label}）`);
    }
    if (envelope.result === undefined) {
      throw new ServiceUnavailableException(`Odoo 上游响应缺 result（${label}）`);
    }
    return envelope.result;
  }
}
