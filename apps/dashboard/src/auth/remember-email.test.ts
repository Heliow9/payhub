import { beforeEach, describe, expect, it } from 'vitest';
import { clearRememberedEmail, getRememberedEmail, saveRememberedEmail } from './remember-email';

describe('lembrar e-mail administrativo', () => {
  beforeEach(() => localStorage.clear());

  it('salva somente o e-mail normalizado', () => {
    saveRememberedEmail('  ADMIN@REALENERGY.COM.BR  ');
    expect(getRememberedEmail()).toBe('admin@realenergy.com.br');
    expect(localStorage.length).toBe(1);
  });

  it('remove o e-mail quando a opção é desmarcada', () => {
    saveRememberedEmail('admin@realenergy.com.br');
    clearRememberedEmail();
    expect(getRememberedEmail()).toBe('');
  });
});
