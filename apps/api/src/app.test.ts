import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { hashPassword } from './domain/auth/password.js';
import { createApp } from './app.js';
import { MemoryAuditRepository } from './infra/repositories/memory/memory-audit.repository.js';
import { MemoryConnectorRepository } from './infra/repositories/memory/memory-connector.repository.js';
import { MemoryImportJobRepository } from './infra/repositories/memory/memory-import-job.repository.js';
import { MemorySessionRepository } from './infra/repositories/memory/memory-session.repository.js';
import { MemoryUserRepository } from './infra/repositories/memory/memory-user.repository.js';

async function fixture(role: 'MASTER' | 'ANALISTA' = 'MASTER') {
  const users = new MemoryUserRepository();
  const sessions = new MemorySessionRepository();
  const audit = new MemoryAuditRepository();
  const connectors = new MemoryConnectorRepository();
  const importJobs = new MemoryImportJobRepository();
  await users.create({ name: role === 'MASTER' ? 'Master' : 'Analista', email: 'user@payhub.local', passwordHash: await hashPassword('Senha#123456'), role, status: 'ACTIVE' });
  const app = createApp({ users, sessions, audit, connectors, importJobs, config: { appOrigin: 'http://localhost:5173', cookieSecure: false, sessionTtlHours: 12, loginRateLimit: 100 } });
  return { app, users, audit, connectors, importJobs };
}

function cookieValue(cookies: string[] | undefined, name: string) {
  const raw = cookies?.find((value) => value.startsWith(`${name}=`));
  return raw?.split(';')[0];
}

describe('PayHub Core API', () => {
  it('serves health', async () => {
    const { app } = await fixture();
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, service: 'PayHub API' });
  });

  it('logs in, resolves me and logs out with CSRF', async () => {
    const { app } = await fixture();
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'user@payhub.local', password: 'Senha#123456' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('MASTER');
    const sessionCookie = cookieValue(login.headers['set-cookie'], 'payhub_session');
    const csrfCookie = cookieValue(login.headers['set-cookie'], 'payhub_csrf');
    expect(sessionCookie).toBeTruthy();
    expect(csrfCookie).toBeTruthy();

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.csrfToken).toBeTruthy();

    const blocked = await agent.post('/api/auth/logout');
    expect(blocked.status).toBe(403);
    const logout = await agent.post('/api/auth/logout').set('X-CSRF-Token', me.body.csrfToken);
    expect(logout.status).toBe(204);
  });

  it('prevents analyst from managing users', async () => {
    const { app } = await fixture('ANALISTA');
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'user@payhub.local', password: 'Senha#123456' });
    const response = await agent.get('/api/users');
    expect(login.status).toBe(200);
    expect(response.status).toBe(403);
  });

  it('lets master create a connector and the agent heartbeat with the one-time token', async () => {
    const { app } = await fixture();
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'user@payhub.local', password: 'Senha#123456' });
    const created = await agent
      .post('/api/connectors')
      .set('X-CSRF-Token', login.body.csrfToken)
      .send({ name: 'Servidor Sage' });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^[a-f0-9]{64}$/);

    const heartbeat = await request(app)
      .post('/api/connector-agent/heartbeat')
      .set('X-PayHub-Connector-Id', String(created.body.connector.id))
      .set('Authorization', `Bearer ${created.body.token}`)
      .send({ machineName: 'SERVIDORSQL' });
    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body.status).toBe('ONLINE');
  });

  it('queues and claims a schema discovery job', async () => {
    const { app } = await fixture();
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: 'user@payhub.local', password: 'Senha#123456' });
    const created = await agent
      .post('/api/connectors')
      .set('X-CSRF-Token', login.body.csrfToken)
      .send({ name: 'Servidor Sage' });
    const queued = await agent
      .post('/api/import-jobs')
      .set('X-CSRF-Token', login.body.csrfToken)
      .send({ jobType: 'SCHEMA_DISCOVERY' });
    expect(queued.status).toBe(201);
    expect(queued.body.job.status).toBe('QUEUED');

    const claimed = await request(app)
      .post('/api/connector-agent/jobs/next')
      .set('X-PayHub-Connector-Id', String(created.body.connector.id))
      .set('Authorization', `Bearer ${created.body.token}`);
    expect(claimed.status).toBe(200);
    expect(claimed.body.job).toMatchObject({ status: 'RUNNING', jobType: 'SCHEMA_DISCOVERY' });
  });

});
