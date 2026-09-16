import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('hashes a password and verifies the correct value', async () => {
    const encoded = await hashPassword('UmaSenha#123');
    expect(encoded).toMatch(/^scrypt\$/);
    await expect(verifyPassword('UmaSenha#123', encoded)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const encoded = await hashPassword('UmaSenha#123');
    await expect(verifyPassword('errada', encoded)).resolves.toBe(false);
  });
});
