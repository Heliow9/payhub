import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

const baseUser = {
  id: 1,
  name: 'Master PayHub',
  email: 'master@payhub.local',
  status: 'ACTIVE' as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

afterEach(() => vi.unstubAllGlobals());

describe('DashboardPage', () => {
  it('shows user management only to master', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { rerender } = render(<DashboardPage user={{ ...baseUser, role: 'MASTER' }} csrfToken="csrf" onLogout={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Usuários' })).toBeInTheDocument();
    rerender(<DashboardPage user={{ ...baseUser, role: 'ANALISTA' }} csrfToken="csrf" onLogout={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Usuários' })).not.toBeInTheDocument();
  });
});
