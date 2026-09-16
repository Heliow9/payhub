import { describe, expect, it } from 'vitest';
import { MemorySessionRepository } from './memory-session.repository.js';

describe('MemorySessionRepository', () => {
  it('does not return revoked sessions', async () => {
    const repo = new MemorySessionRepository();
    const now = new Date();
    const session = await repo.create({ userId: 1, tokenHash: 'token', csrfTokenHash: 'csrf', expiresAt: new Date(now.getTime() + 60_000) });
    expect(await repo.findActiveByTokenHash('token', now)).not.toBeNull();
    await repo.revoke(session.id, now);
    expect(await repo.findActiveByTokenHash('token', now)).toBeNull();
  });
});
