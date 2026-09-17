import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(secret: string, value: string | Buffer): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(secret, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

function isLegacyHexScrypt(encoded: string): boolean {
  const [kind, saltRaw, hashRaw] = encoded.split('$');
  return kind === 'scrypt' && /^[0-9a-f]{32}$/i.test(saltRaw ?? '') && /^[0-9a-f]{128}$/i.test(hashRaw ?? '');
}

export function needsSecretRehash(encoded: string | null | undefined): boolean {
  return Boolean(encoded && isLegacyHexScrypt(encoded));
}

export async function verifySecret(secret: string, encoded: string | null | undefined): Promise<boolean> {
  if (!encoded) return false;
  const [kind, saltRaw, hashRaw] = encoded.split('$');
  if (kind !== 'scrypt' || !saltRaw || !hashRaw) return false;
  try {
    const legacy = isLegacyHexScrypt(encoded);
    const salt = Buffer.from(saltRaw, legacy ? 'hex' : 'base64url');
    const expected = Buffer.from(hashRaw, legacy ? 'hex' : 'base64url');
    if (!salt.length || !expected.length) return false;
    const actual = (await scrypt(secret, salt, expected.length)) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11);
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (base: string, factor: number) => {
    let total = 0;
    for (const char of base) total += Number(char) * factor--;
    const rest = (total * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = digit(cpf.slice(0, 9), 10);
  const d2 = digit(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

export function maskCpf(value: string): string {
  const cpf = normalizeCpf(value).padEnd(11, '*');
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9, 11)}`;
}

export function isSixDigitPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}
