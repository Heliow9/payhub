import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';

function Probe() {
  const { principal, loading, pendingSelection, login, selectCompany } = useAuth();
  if (loading) return <span>loading</span>;
  return <div>
    <span>{principal?.kind === 'USER' ? principal.email : principal?.kind === 'EMPLOYEE' ? `${principal.companyName}:${principal.accessMode}` : 'anonymous'}</span>
    {pendingSelection && <><span>Escolha a empresa</span>{pendingSelection.companies.map((company) => <button key={company.companyId} onClick={() => void selectCompany(company.companyId)}>{company.companyName}</button>)}</>}
    <button onClick={() => void login('529.982.247-25', '123456')}>login employee</button>
  </div>;
}

const adminPrincipal = {
  kind: 'USER', id: 1, companyId: 1, companyName: 'RealEnergy', name: 'Administrador',
  email: 'admin@realenergy.com.br', role: 'MASTER', status: 'ACTIVE',
} as const;

const historicEmployee = {
  kind: 'EMPLOYEE', id: 22, identityId: 10, companyId: 2, companyName: 'Empresa B', name: 'Maria', cpf: '52998224725',
  status: 'TERMINATED', accessMode: 'HISTORICAL',
} as const;

describe('restauração e login de sessão', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('restaura o principal e o CSRF retornado por /auth/me', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ principal: adminPrincipal, csrfToken: 'csrf-renovado' }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('admin@realenergy.com.br');
    await waitFor(() => expect(sessionStorage.getItem('payhub_csrf')).toBe('csrf-renovado'));
  });

  it('não define principal enquanto empresa precisa ser escolhida', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ principal: null, csrfToken: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('/api/auth/login')) return new Response(JSON.stringify({
        requiresCompanySelection: true,
        selectionToken: 'selection-token-with-enough-size',
        companies: [
          { companyId: 1, companyName: 'RealEnergy', employeeId: 11, name: 'Maria', status: 'ACTIVE', accessMode: 'FULL' },
          { companyId: 2, companyName: 'Empresa B', employeeId: 22, name: 'Maria', status: 'TERMINATED', accessMode: 'HISTORICAL' },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }));

    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('anonymous');
    await userEvent.click(screen.getByRole('button', { name: 'login employee' }));
    await screen.findByText('Escolha a empresa');
    expect(screen.getByText('anonymous')).toBeVisible();
    expect(sessionStorage.getItem('payhub_csrf')).toBeNull();
  });

  it('seleciona vínculo histórico e carrega empresa atual', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ principal: null, csrfToken: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('/api/auth/login')) return new Response(JSON.stringify({
        requiresCompanySelection: true, selectionToken: 'selection-token-with-enough-size',
        companies: [{ companyId: 2, companyName: 'Empresa B', employeeId: 22, name: 'Maria', status: 'TERMINATED', accessMode: 'HISTORICAL' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('/api/auth/select-company')) return new Response(JSON.stringify({ principal: historicEmployee, csrfToken: 'csrf-company-b' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('/api/auth/companies')) return new Response(JSON.stringify({ companies: [{ companyId: 2, companyName: 'Empresa B', employeeId: 22, name: 'Maria', status: 'TERMINATED', accessMode: 'HISTORICAL' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }));

    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('anonymous');
    await userEvent.click(screen.getByRole('button', { name: 'login employee' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Empresa B' }));
    await screen.findByText('Empresa B:HISTORICAL');
    expect(sessionStorage.getItem('payhub_csrf')).toBe('csrf-company-b');
  });
});
