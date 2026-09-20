import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { DashboardPage } from './DashboardPage';

afterEach(() => vi.restoreAllMocks());

describe('DashboardPage', () => {
  it('carrega as métricas da empresa autenticada', async () => {
    vi.spyOn(api, 'dashboard').mockResolvedValue({
      metrics: { employees: 12, groups: 3, ready: 4, pending: 2, signed: 8, failed: 0 },
      connectors: [],
      runs: [],
    });

    render(<DashboardPage />);

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('Funcionários ativos')).toBeInTheDocument();
    expect(api.dashboard).toHaveBeenCalledTimes(1);
  });
});
