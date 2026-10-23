import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildGenericOAuthConfigs,
  formatGenericChannelDiagnostics,
  KNOWN_GENERIC_CHANNELS,
  resolveGenericChannels,
} from './generic-oauth-channels';

const feishuSecrets = { feishu: { clientId: 'cli_x', clientSecret: 'sec_y' } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildGenericOAuthConfigs', () => {
  it('无启用列表时返回空（NFR-2 未配即降级）', () => {
    expect(buildGenericOAuthConfigs([], {})).toEqual([]);
  });

  it('暂缓渠道（wechat/dingtalk/wecom）仅接口位，无构建器即跳过', () => {
    expect(KNOWN_GENERIC_CHANNELS).toContain('wechat');
    const out = buildGenericOAuthConfigs(['wechat', 'dingtalk', 'wecom'], {
      wechat: { clientId: 'a', clientSecret: 'b' },
    });
    expect(out).toEqual([]);
  });

  it('飞书缺凭证时降级不注册', () => {
    expect(
      buildGenericOAuthConfigs(['feishu'], { feishu: { clientId: '', clientSecret: '' } }),
    ).toEqual([]);
  });

  it('飞书配齐凭证时构建配置，且强制方案 C（不独立建号）+ 关 PKCE', () => {
    const [cfg] = buildGenericOAuthConfigs(['feishu'], feishuSecrets);
    expect(cfg).toBeDefined();
    expect(cfg.providerId).toBe('feishu');
    expect(cfg.disableSignUp).toBe(true);
    expect(cfg.pkce).toBe(false);
    expect(cfg.authorizationUrl).toContain('accounts.feishu.cn');
    expect(cfg.tokenUrl).toContain('authen/v2/oauth/token');
    expect(cfg.userInfoUrl).toContain('authen/v1/user_info');
  });

  it('accountSubject 优先 union_id，回退 open_id', () => {
    const [cfg] = buildGenericOAuthConfigs(['feishu'], feishuSecrets);
    const resolve = cfg.accountSubject as (ctx: any) => string;
    expect(resolve({ tokens: {}, profile: { union_id: 'u1', open_id: 'o1' } })).toBe('u1');
    expect(resolve({ tokens: {}, profile: { open_id: 'o1' } })).toBe('o1');
  });

  it('mapProfileToUser 映射 name/image，email 缺省为 null', () => {
    const [cfg] = buildGenericOAuthConfigs(['feishu'], feishuSecrets);
    const map = cfg.mapProfileToUser as (p: any) => any;
    expect(map({ name: '张三', avatar_url: 'http://a' })).toEqual({
      name: '张三',
      email: null,
      image: 'http://a',
      emailVerified: false,
    });
  });

  it('getToken 以 JSON body 换取并归一化为 OAuth2Tokens', async () => {
    const fetchMock = vi.fn(async (url: string, init: any) => {
      expect(url).toContain('authen/v2/oauth/token');
      expect(init.headers['Content-Type']).toContain('application/json');
      expect(JSON.parse(init.body)).toMatchObject({
        grant_type: 'authorization_code',
        client_id: 'cli_x',
        client_secret: 'sec_y',
        code: 'CODE',
      });
      return {
        json: async () => ({ code: 0, access_token: 'at', expires_in: 7200, token_type: 'Bearer' }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const [cfg] = buildGenericOAuthConfigs(['feishu'], feishuSecrets);
    const getToken = cfg.getToken;
    if (!getToken) throw new Error('feishu getToken missing');
    const tokens = await getToken({ code: 'CODE', redirectURI: 'https://x/cb' } as any);
    expect(tokens.accessToken).toBe('at');
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.accessTokenExpiresAt).toBeInstanceOf(Date);
  });

  it('getUserInfo 解包嵌套 data 并补 emailVerified', async () => {
    vi.stubGlobal('fetch', async (_url: string, init: any) => ({
      json: async () => {
        expect(init.headers.Authorization).toBe('Bearer at');
        return { code: 0, data: { open_id: 'o1', name: '张三' } };
      },
    }));

    const [cfg] = buildGenericOAuthConfigs(['feishu'], feishuSecrets);
    const getUserInfo = cfg.getUserInfo;
    if (!getUserInfo) throw new Error('feishu getUserInfo missing');
    const profile = await getUserInfo({ accessToken: 'at' } as any);
    expect(profile).toMatchObject({ open_id: 'o1', name: '张三', emailVerified: false });
  });
});

describe('resolveGenericChannels 未注册归因（切片 A 对称半边·generic 面）', () => {
  it('一次遍历同时给出可注册配置与被弃清单', () => {
    const { configs, drops } = resolveGenericChannels(['feishu', 'wechat', 'dingding'], {
      ...feishuSecrets,
      wechat: { clientId: 'a', clientSecret: 'b' },
    });
    expect(configs.map((c) => c.providerId)).toEqual(['feishu']);
    expect(drops).toEqual([
      { id: 'wechat', reason: 'builder-pending' },
      { id: 'dingding', reason: 'unknown-id' },
    ]);
  });

  it('缺凭证仍按 NFR-2 降级不注册，但给出归因而非静默消失', () => {
    const { configs, drops } = resolveGenericChannels(['feishu'], {
      feishu: { clientId: '', clientSecret: '' },
    });
    expect(configs).toEqual([]);
    expect(drops).toEqual([{ id: 'feishu', reason: 'missing-credentials' }]);
  });

  it('warn 文案点名接口位与拼错两类真因', () => {
    const report = formatGenericChannelDiagnostics(
      resolveGenericChannels(['wechat', 'dingding'], {}).drops,
    );
    expect(report).toContain('2 个已声明的境内 OAuth 渠道');
    expect(report).toContain('- wechat：');
    expect(report).toContain('接口位');
    expect(report).toContain('- dingding：');
    expect(report).toContain('拼错 providerId');
  });

  it('buildGenericOAuthConfigs 仍为薄封装（既有契约不变·不拒启）', () => {
    expect(buildGenericOAuthConfigs(['feishu'], feishuSecrets)).toHaveLength(1);
    expect(buildGenericOAuthConfigs(['wechat'], {})).toEqual([]);
  });
});
