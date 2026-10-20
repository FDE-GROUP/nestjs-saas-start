import type { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import {
  Account,
  Consent,
  Session,
  User,
} from '@app/modules/auth/infrastructure/entities/ba-identity.entities';
import type { EntityManager } from '@mikro-orm/core';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExportUserDataQuery } from '../export-user-data.query';
import { ExportUserDataQueryHandler } from './export-user-data.query-handler';

/**
 * ORM 修宪案 B · 切片 3d（S-d4）双轨**镜像断言**：数据通道由旧 ORM
 * `db.query.user.findFirst({columns})` + `select().from().where()` 换成 Mikro
 * `em.findOne(User,…,{fields})` + `em.find(Entity,…,{fields})`。fake `em` 经 `MikroOrmService.fork()` 供给。
 *
 * **R-B1 凭据红线（非弱化）**：与旧版逐列对齐——四表读全部走 `fields` 白名单，凭据列在
 * **生成的 SELECT 投影面即被排除**（非取回后删），故测直接断言 `fields` 列表不含凭据键；另加序列化
 * 载荷红线兜底。fake 行刻意携带 password/accessToken/evidence 等，验证映射层不外泄。
 */
function makeForkEm() {
  const findOne = vi.fn();
  const find = vi.fn();
  const em = { findOne, find } as unknown as EntityManager;
  const fork = vi.fn().mockResolvedValue(em);
  const mikro = { fork } as unknown as MikroOrmService;
  return { handler: new ExportUserDataQueryHandler(mikro), findOne, find, fork };
}

const baseUserRow = {
  id: 'u1',
  email: 'a@b.c',
  name: 'Ann',
  handle: 'ann',
  image: null,
  firstName: 'Ann',
  lastName: 'L',
  role: 'USER',
  emailVerified: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  // 刻意携带凭据列，验证 fields 投影 / 映射层将其排除在载荷外：
  password: 'should-not-appear',
  isOwner: true,
  dateField: null,
};

describe('ExportUserDataQueryHandler (PIPL right-to-access · C1 · S-d4 Mikro)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NotFound when user missing (findOne → null)', async () => {
    const { handler, findOne, find } = makeForkEm();
    findOne.mockResolvedValueOnce(null);
    await expect(handler.execute(new ExportUserDataQuery('ghost'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // 用户不存在即早退，绝不发起其余三表读。
    expect(find).not.toHaveBeenCalled();
  });

  it('aggregates user + accounts + sessions + consents and never leaks credentials', async () => {
    const { handler, findOne, find } = makeForkEm();
    findOne.mockResolvedValueOnce(baseUserRow);
    const accountRow = {
      id: 'a1',
      providerId: 'feishu',
      accountId: 'fs1',
      scope: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
      // 携带凭据列——应被 fields 投影排除、映射层不外泄：
      password: 'hash',
      accessToken: 'tok',
      refreshToken: 'ref',
      idToken: 'idt',
    };
    const sessionRow = {
      id: 's1',
      provider: null,
      expiresAt: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
      token: 'sess-token',
      ipAddress: '1.2.3.4',
      userAgent: 'UA',
    };
    const consentRow = {
      id: 'c1',
      purpose: 'terms',
      version: 'v1',
      grantedAt: new Date('2026-01-01T00:00:00.000Z'),
      revokedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
      evidence: 'ip/ua audit',
    };
    find
      .mockResolvedValueOnce([accountRow])
      .mockResolvedValueOnce([sessionRow])
      .mockResolvedValueOnce([consentRow]);

    const result = await handler.execute(new ExportUserDataQuery('u1'));

    expect(result.user.id).toBe('u1');
    expect(result.user.role).toBe('USER');
    expect(result.accounts[0]).toMatchObject({ id: 'a1', providerId: 'feishu' });
    expect(result.sessions[0]).toMatchObject({ id: 's1' });
    expect(result.consents[0]).toMatchObject({ id: 'c1', purpose: 'terms', version: 'v1' });

    // R-B1：四表读各取 fields 白名单，凭据列在 SELECT 投影面即被排除。
    const userFields = (findOne.mock.calls[0][2] as { fields: string[] }).fields;
    expect(userFields).not.toContain('password');
    expect(userFields).not.toContain('isOwner');
    expect(userFields).toContain('email');

    const readFields = (entity: unknown): string[] => {
      const call = find.mock.calls.find((c) => c[0] === entity);
      return (call?.[2] as { fields: string[] } | undefined)?.fields ?? [];
    };
    expect(readFields(Account)).toEqual([
      'id',
      'providerId',
      'accountId',
      'scope',
      'accessTokenExpiresAt',
      'refreshTokenExpiresAt',
      'createdAt',
      'updatedAt',
    ]);
    for (const forbidden of ['password', 'accessToken', 'refreshToken', 'idToken']) {
      expect(readFields(Account)).not.toContain(forbidden);
    }
    for (const forbidden of ['token', 'ipAddress', 'userAgent']) {
      expect(readFields(Session)).not.toContain(forbidden);
    }
    expect(readFields(Consent)).not.toContain('evidence');
  });

  it('red line: serialized payload contains no credential keys', async () => {
    const { handler, findOne, find } = makeForkEm();
    findOne.mockResolvedValueOnce(baseUserRow);
    find.mockResolvedValue([]);
    const payload = await handler.execute(new ExportUserDataQuery('u1'));
    const json = JSON.stringify(payload);
    for (const forbidden of [
      'password',
      'accessToken',
      'refreshToken',
      'idToken',
      'evidence',
      'should-not-appear',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('targets the correct entities with the userId predicate (fork once per request)', async () => {
    const { handler, findOne, find, fork } = makeForkEm();
    findOne.mockResolvedValueOnce(baseUserRow);
    find.mockResolvedValue([]);
    await handler.execute(new ExportUserDataQuery('u1'));
    expect(fork).toHaveBeenCalledTimes(1);
    expect(findOne.mock.calls[0][0]).toBe(User);
    expect(findOne.mock.calls[0][1]).toEqual({ id: 'u1' });
    const readEntities = find.mock.calls.map((c) => c[0]);
    expect(readEntities).toEqual([Account, Session, Consent]);
    for (const c of find.mock.calls) expect(c[1]).toEqual({ userId: 'u1' });
  });
});
