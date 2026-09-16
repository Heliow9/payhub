import { describe, expect, it } from 'vitest';
import { MemoryUserRepository } from './memory-user.repository.js';

describe('MemoryUserRepository', () => {
  it('creates, finds and counts masters', async () => {
    const repo = new MemoryUserRepository();
    const user = await repo.create({ name: 'Master', email: 'master@payhub.local', passwordHash: 'hash', role: 'MASTER', status: 'ACTIVE' });
    expect((await repo.findByEmail('MASTER@PAYHUB.LOCAL'))?.id).toBe(user.id);
    expect(await repo.countMasters()).toBe(1);
    expect(await repo.list()).toHaveLength(1);
  });
});
