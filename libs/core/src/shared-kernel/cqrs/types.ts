import { Command, Query } from '@nestjs/cqrs';

/**
 * 各限界上下文 Command / Query 的公共基类（薄约定层）。
 *
 * @remarks
 * Thin conventions layer over `@nestjs/cqrs` message base classes.
 * Commands and Queries in every bounded context extend these so the result type
 * is inferred by the bus (`commandBus.execute<C, R>` / `queryBus.execute<C, R>`).
 *
 * Note: this folder intentionally touches the CQRS library. The purity rule applies
 * to each context's domain folder only; commands and queries are application artifacts.
 *
 * @public
 */
export abstract class BaseCommand<TResult = void> extends Command<TResult> {}

/**
 * 各限界上下文 Query 的公共基类（结果类型经 bus 推断）。
 *
 * @public
 */
export abstract class BaseQuery<TResult> extends Query<TResult> {}
