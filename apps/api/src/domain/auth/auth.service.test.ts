import { describe, expect, it } from 'vitest';
import { MemoryAuditRepository } from '../../infra/repositories/memory/memory-audit.repository.js';
import { MemorySessionRepository } from '../../infra/repositories/memory/memory-session.repository.js';
import { MemoryUserRepository } from '../../infra/repositories/memory/memory-user.repository.js';
import { hashPassword } from './password.js';
import { AuthService } from './auth.service.js';
import { csrfMatches } from './authorization.js';

describe('AuthService', () => {
  it('creates a session, resolves it and revokes it on logout', async () => {
    const users = new MemoryUserRepository();
    const sessions = new MemorySessionRepository();
    const audit = new MemoryAuditRepository();
    await users.create({ name: 'Master', email: 'master@payhub.local', passwordHash: await hashPassword('Senha#123456'), role: 'MASTER', status: 'ACTIVE' });
    const auth = new AuthService(users, sessions, audit, 12);

    const login = await auth.login({ email: 'MASTER@PAYHUB.LOCAL', password: 'Senha#123456' });
    expect(login.user.role).toBe('MASTER');
    expect(csrfMatches(login.session, login.csrfToken)).toBe(true);
    expect((await auth.resolveSession(login.sessionToken))?.user.id).toBe(login.user.id);

    await auth.logout(login.sessionToken);
    expect(await auth.resolveSession(login.sessionToken)).toBeNull();
  });
});
