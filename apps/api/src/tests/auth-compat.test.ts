import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { hashSecret, needsSecretRehash, verifySecret } from '../core/security.js';

const scrypt = promisify(scryptCallback);

async function legacyEtapa2Hash(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(secret, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

describe('compatibilidade de credenciais administrativas', () => {
  it('valida hashes scrypt legados da Etapa 2', async () => {
    const legacy = await legacyEtapa2Hash('Senha#123456');
    expect(await verifySecret('Senha#123456', legacy)).toBe(true);
    expect(await verifySecret('SenhaIncorreta', legacy)).toBe(false);
  });

  it('identifica hash legado para upgrade após login bem-sucedido', async () => {
    const legacy = await legacyEtapa2Hash('Senha#123456');
    const current = await hashSecret('Senha#123456');
    expect(needsSecretRehash(legacy)).toBe(true);
    expect(needsSecretRehash(current)).toBe(false);
  });
});
