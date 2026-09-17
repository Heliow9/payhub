import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';

function Probe() {
  const { principal, loading, login } = useAuth();
  if (loading) return <span>loading</span>;
  return <div>
    <span>{principal?.kind === 'USER' ? principal.email : 'anonymous'}</span>
    <button onClick={() => void login('admin@realenergy.com.br', 'senha-digitada')}>login</button>
  </div>;
}

const adminPrincipal = {
  kind: 'USER', id: 1, name: 'Administrador', email: 'admin@realenergy.com.br', role: 'MASTER', status: 'ACTIVE'
} as const;

describe('restauração e login de sessão', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('restaura o principal e o CSRF retornado por /auth/me', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        return new Response(JSON.stringify({ principal: adminPrincipal, csrfToken: 'csrf-renovado' }), {
          status: 200, headers: { 'content-type': 'application/json' }
        });
      }
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }));

    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('admin@realenergy.com.br');
    await waitFor(() => expect(sessionStorage.getItem('payhub_csrf')).toBe('csrf-renovado'));
  });

  it('trata ausência de sessão como estado anônimo e faz somente o login quando o usuário entrar', async () => {
    let meCalls = 0;
    let loginCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        meCalls += 1;
        return new Response(JSON.stringify({ principal: null, csrfToken: '' }), {
          status: 200, headers: { 'content-type': 'application/json' }
        });
      }
      if (url.endsWith('/api/auth/login')) {
        loginCalls += 1;
        return new Response(JSON.stringify({ principal: adminPrincipal, csrfToken: 'csrf-login' }), {
          status: 200, headers: { 'content-type': 'application/json' }
        });
      }
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }));

    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('anonymous');
    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    await screen.findByText('admin@realenergy.com.br');
    expect(meCalls).toBe(1);
    expect(loginCalls).toBe(1);
    expect(sessionStorage.getItem('payhub_csrf')).toBe('csrf-login');
  });
});
