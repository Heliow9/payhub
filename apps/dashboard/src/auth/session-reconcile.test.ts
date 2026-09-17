import { describe, expect, it, vi } from 'vitest';
import { reconcileSession } from './session-reconcile';

describe('reconcileSession', () => {
  it('usa a sessão válida sem tentar autenticar novamente', async () => {
    const restore = vi.fn().mockResolvedValue({ principal: 'session' });
    const authenticate = vi.fn().mockRejectedValue(new Error('credenciais incorretas'));
    const result = await reconcileSession(restore, authenticate);
    expect(result).toEqual({ principal: 'session' });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('autentica com credenciais quando não existe sessão válida', async () => {
    const restore = vi.fn().mockRejectedValue(new Error('sem sessão'));
    const authenticate = vi.fn().mockResolvedValue({ principal: 'login' });
    const result = await reconcileSession(restore, authenticate);
    expect(result).toEqual({ principal: 'login' });
    expect(authenticate).toHaveBeenCalledOnce();
  });
});
