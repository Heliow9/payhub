import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { LoginPage } from './LoginPage';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe('LoginPage', () => {
  it('mostra seletor quando o CPF possui mais de uma empresa', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ principal: null, csrfToken: '' }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('/api/auth/login')) return new Response(JSON.stringify({
        requiresCompanySelection: true,
        selectionToken: 'selection-token-with-enough-size',
        companies: [
          { companyId: 1, companyName: 'RealEnergy', employeeId: 10, name: 'Maria', status: 'ACTIVE', accessMode: 'FULL' },
          { companyId: 2, companyName: 'Empresa B', employeeId: 20, name: 'Maria', status: 'TERMINATED', accessMode: 'HISTORICAL' },
        ],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    }));

    render(<AuthProvider><LoginPage /></AuthProvider>);
    await screen.findByText('Bem-vindo ao PayHub');
    await userEvent.type(screen.getByLabelText('E-mail ou CPF'), '52998224725');
    await userEvent.type(screen.getByLabelText('PIN de 6 dígitos'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Escolha a empresa')).toBeVisible();
    expect(screen.getByText('RealEnergy')).toBeVisible();
    expect(screen.getByText('Empresa B')).toBeVisible();
    expect(screen.getByText(/acesso histórico/i)).toBeVisible();
  });
});
