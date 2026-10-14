import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

vi.mock('expo-secure-store', () => secureStore);
vi.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', documentDirectory: 'file:///documents/' }));

describe('mobile API session reconciliation', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    secureStore.getItemAsync.mockImplementation(async (key: string) => key.includes('token') ? 'access-restored' : 'csrf-restored');
  });

  it('apresenta o CSRF salvo ao reconciliar a sessão por GET', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer access-restored');
      expect(headers.get('x-csrf-token')).toBe('csrf-restored');
      return new Response(JSON.stringify({ principal: null, csrfToken: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { api, restoreSessionSecrets } = await import('./api');
    await restoreSessionSecrets();
    await api.me();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('compartilha uma única reconciliação entre chamadas simultâneas', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.fn(async () => {
      await pending;
      return new Response(JSON.stringify({ principal: null, csrfToken: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { api, restoreSessionSecrets } = await import('./api');
    await restoreSessionSecrets();
    const first = api.me();
    const second = api.me();
    expect(fetchMock).toHaveBeenCalledOnce();
    release();
    await Promise.all([first, second]);
  });

  it('não envia duas assinaturas simultâneas para o mesmo holerite', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.fn(async () => {
      await pending;
      return new Response(JSON.stringify({ evidenceId: 9, signedAt: '2026-10-14T10:00:00Z' }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { api, restoreSessionSecrets } = await import('./api');
    await restoreSessionSecrets();
    const body={pin:'123456',drawing:'data:image/png;base64,dGVzdA==',origin:'ANDROID'};
    const first=api.signPayroll(42,body);
    const second=api.signPayroll(42,body);
    expect(fetchMock).toHaveBeenCalledOnce();
    release();
    await Promise.all([first,second]);
  });
});
