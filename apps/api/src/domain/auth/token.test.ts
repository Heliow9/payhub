import { describe, expect, it } from 'vitest';
import { generateOpaqueToken, hashToken } from './token.js';

describe('tokens', () => {
  it('generates high-entropy unique tokens', () => {
    const first = generateOpaqueToken();
    const second = generateOpaqueToken();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });

  it('hashes tokens deterministically with SHA-256', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
