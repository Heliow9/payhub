import { describe, expect, it } from 'vitest';
import { MemoryAuditRepository } from '../../infra/repositories/memory/memory-audit.repository.js';
import { MemoryUserRepository } from '../../infra/repositories/memory/memory-user.repository.js';
import { UserAdminService } from './user-admin.service.js';

describe('UserAdminService', () => {
  it('allows only master to create analysts', async () => {
    const users = new MemoryUserRepository();
    const audit = new MemoryAuditRepository();
    const master = await users.create({ name: 'Master', email: 'master@payhub.local', passwordHash: 'hash', role: 'MASTER', status: 'ACTIVE' });
    const analystActor = await users.create({ name: 'Analista', email: 'actor@payhub.local', passwordHash: 'hash', role: 'ANALISTA', status: 'ACTIVE' });
    const service = new UserAdminService(users, audit);

    await expect(service.createAnalyst(analystActor, { name: 'Outro', email: 'outro@payhub.local', password: 'Senha#123456' })).rejects.toThrow('Acesso negado');
    const created = await service.createAnalyst(master, { name: 'Novo Analista', email: 'novo@payhub.local', password: 'Senha#123456' });
    expect(created.role).toBe('ANALISTA');
  });
});
