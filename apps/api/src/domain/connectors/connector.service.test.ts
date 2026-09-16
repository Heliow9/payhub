import { describe, expect, it } from 'vitest';
import { MemoryAuditRepository } from '../../infra/repositories/memory/memory-audit.repository.js';
import { MemoryConnectorRepository } from '../../infra/repositories/memory/memory-connector.repository.js';
import { MemoryImportJobRepository } from '../../infra/repositories/memory/memory-import-job.repository.js';
import type { User } from '../users/user.repository.js';
import { ConnectorAuthError, ConnectorService } from './connector.service.js';

const master: User = {
  id: 1,
  name: 'Master',
  email: 'master@payhub.local',
  passwordHash: 'unused',
  role: 'MASTER',
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ConnectorService', () => {
  it('returns the connector token once and authenticates by its hash', async () => {
    const connectors = new MemoryConnectorRepository();
    const service = new ConnectorService(connectors, new MemoryImportJobRepository(), new MemoryAuditRepository());
    const created = await service.createConnector(master, 'Servidor Sage');

    expect(created.token).toMatch(/^[a-f0-9]{64}$/);
    expect(created.connector.tokenHash).not.toBe(created.token);
    await expect(service.authenticate(created.connector.id, created.token)).resolves.toMatchObject({ id: created.connector.id });
    await expect(service.authenticate(created.connector.id, 'token-invalido')).rejects.toBeInstanceOf(ConnectorAuthError);
  });

  it('claims one queued job and transitions it to running', async () => {
    const connectors = new MemoryConnectorRepository();
    const jobs = new MemoryImportJobRepository();
    const service = new ConnectorService(connectors, jobs, new MemoryAuditRepository());
    const created = await service.createConnector(master, 'Servidor Sage');
    const connector = await service.authenticate(created.connector.id, created.token);
    await service.createJob(master, { jobType: 'SCHEMA_DISCOVERY', scope: null });

    const job = await service.claimNext(connector);
    expect(job).toMatchObject({ status: 'RUNNING', connectorId: connector.id, jobType: 'SCHEMA_DISCOVERY' });
    await expect(service.claimNext(connector)).resolves.toBeNull();
  });
});
