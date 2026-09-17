import { render, screen, waitFor } from '@testing-library/react';
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

describe('restauração e reconciliação de sessão', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

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

  it('reconcilia uma sessão válida antes de tentar novo login', async () => {
    let meCalls = 0;
    let loginCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) {
        meCalls += 1;
        if (meCalls === 1) {
          return new Response(JSON.stringify({ error: 'Autenticação necessária.' }), {
            status: 401, headers: { 'content-type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ principal: adminPrincipal, csrfToken: 'csrf-recuperado' }), {
          status: 200, headers: { 'content-type': 'application/json' }
        });
      }
      if (url.endsWith('/api/auth/login')) {
        loginCalls += 1;
        return new Response(JSON.stringify({ error: 'Credenciais inválidas.' }), {
          status: 401, headers: { 'content-type': 'application/json' }
        });
      }
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }));

    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('anonymous');
    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    await screen.findByText('admin@realenergy.com.br');
    expect(loginCalls).toBe(0);
    expect(sessionStorage.getItem('payhub_csrf')).toBe('csrf-recuperado');
  });
});
