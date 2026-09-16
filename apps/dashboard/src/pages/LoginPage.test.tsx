import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('submits credentials', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} />);
    await user.type(screen.getByLabelText('E-mail'), 'master@payhub.local');
    await user.type(screen.getByLabelText('Senha'), 'Senha#123456');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(onLogin).toHaveBeenCalledWith('master@payhub.local', 'Senha#123456');
  });
});
