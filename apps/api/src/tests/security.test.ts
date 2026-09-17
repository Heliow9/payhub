import { describe, expect, it } from 'vitest';
import { hashSecret, isSixDigitPin, isValidCpf, normalizeCpf, verifySecret } from '../core/security.js';

describe('segurança do funcionário', () => {
  it('normaliza e valida CPF', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
  });

  it('exige PIN com exatamente 6 números', () => {
    expect(isSixDigitPin('123456')).toBe(true);
    expect(isSixDigitPin('12345')).toBe(false);
    expect(isSixDigitPin('12345a')).toBe(false);
  });

  it('armazena PIN como scrypt e valida sem recuperar texto puro', async () => {
    const hash = await hashSecret('123456');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain('123456');
    expect(await verifySecret('123456', hash)).toBe(true);
    expect(await verifySecret('654321', hash)).toBe(false);
  });
});
