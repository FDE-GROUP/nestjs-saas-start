import { ConfigService } from '@app/config/config.service';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { Session } from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';

/**
 * 过期 session 周期回收（module-session-index-and-expiry-reclaim F2 · 甲′档·人「同意 GO·亲签迁移」2026-10-20）。
 *
 * 终结 session 表无界增长：定期 `nativeDelete(Session, { expiresAt: { $lt: now } })`——谓词走 F1 的
 * `session_expires_at_idx` 命中索引（无该索引则本删除自身反成全表扫）。session 归 auth 域，本 provider
 * 是域自有周期任务（沿 `session-store.adapter.ts` 表所有权纪律）。
 *
 * **生命周期骨架逐字镜像 `OutboxRelay`**（仓内既有周期 DB 后台任务范式·全仓不用 `@nestjs/schedule`）：
 * config 门控起 `setInterval` + 防重入 flag + 公开 `reclaimOnce()` 供确定性单测/e2e 直调（不依赖墙钟）+
 * `onModuleDestroy` 摘 timer。缺省 `enabled=false`（env 未置 `SESSION_RECLAIM_ENABLED=true`）⇒ 不启 timer、
 * 不触库——与 eventPublish 缺省 inproc 同守 **DB-free 装配不变量**（121 无库冒烟文件不受影响）。
 *
 * **幂等**：`nativeDelete` 天然可重入，多实例并发各跑一次删除结果一致（无 relay 式 SKIP LOCKED 互斥需求）。
 * 单语句删净全部过期行——模板/参考应用规模足够；海量场景如需限批可改 `DELETE … WHERE ctid IN (SELECT … LIMIT n)`（本案未采）。
 */
@Injectable()
export class SessionReclaimService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SessionReclaimService.name);
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;

  constructor(
    // S9 教训：构造函数注入类值导入 + 显式 @Inject，防 swc design:paramtypes 退化
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(MikroOrmService) private readonly mikro: MikroOrmService,
  ) {}

  onApplicationBootstrap(): void {
    const { enabled, intervalMs } = this.config.getSessionReclaimConfig();
    if (!enabled) {
      return;
    }
    this.timer = setInterval(() => {
      this.reclaimOnce().catch((error: unknown) =>
        this.logger.error(`session reclaim tick failed: ${String(error)}`),
      );
    }, intervalMs);
    this.logger.log(`session reclaim started (interval ${intervalMs}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * 回收一轮，返回删除行数。防重入（上一拍未完 → 立即返回 0，timer 拍不叠加）。
   * 公开入口供单测/真库 e2e 直调（确定性驱动，不依赖墙钟）。
   */
  async reclaimOnce(): Promise<number> {
    if (this.ticking) {
      return 0;
    }
    this.ticking = true;
    try {
      const em = await this.mikro.fork();
      return await em.nativeDelete(Session, { expiresAt: { $lt: new Date() } } as never);
    } finally {
      this.ticking = false;
    }
  }
}
