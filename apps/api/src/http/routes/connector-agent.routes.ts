import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { ConnectorValidationError, type ConnectorService } from '../../domain/connectors/connector.service.js';
import { asyncRoute, requestContext } from '../http-utils.js';
import { requireConnectorAuth } from '../middleware/connector-auth.js';

const heartbeatSchema = z.object({
  machineName: z.string().trim().min(1).max(190).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const progressSchema = z.object({
  current: z.number().int().min(0),
  total: z.number().int().min(0),
  message: z.string().max(500).nullable().optional(),
});

const logSchema = z.object({
  level: z.enum(['INFO', 'WARN', 'ERROR']).default('INFO'),
  message: z.string().trim().min(1).max(1000),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const batchSchema = z.object({
  sourceTable: z.enum(['Funcionario', 'FunDocumento', 'FunFuncional', 'FunSalario', 'ProcEvento', 'EventoGVigencia', 'ProcBase', 'MovCapa', 'MovEvento', 'SchemaDiscovery', 'ConnectionTest']),
  batchNumber: z.number().int().min(0),
  rows: z.array(z.unknown()).max(1000),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

const completeSchema = z.object({ message: z.string().max(500).nullable().optional() });
const failSchema = z.object({ error: z.string().trim().min(1).max(1000) });
function jobIdParam(value: string | string[] | undefined): number {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new ConnectorValidationError('Job inválido.');
  return parsed;
}


export function createConnectorAgentRouter(service: ConnectorService) {
  const router = Router();
  router.use(requireConnectorAuth(service));

  router.post('/heartbeat', asyncRoute(async (req, res) => {
    const input = heartbeatSchema.parse(req.body ?? {});
    const connector = await service.heartbeat(req.connector!, input, requestContext(req));
    res.json({ connectorId: connector.id, status: connector.status, serverTime: new Date().toISOString() });
  }));

  router.post('/jobs/next', asyncRoute(async (req, res) => {
    const job = await service.claimNext(req.connector!);
    if (!job) {
      res.status(204).end();
      return;
    }
    res.json({ job });
  }));

  router.post('/jobs/:id/progress', asyncRoute(async (req, res) => {
    const jobId = jobIdParam(req.params.id);
    const input = progressSchema.parse(req.body);
    await service.updateProgress(req.connector!, jobId, input);
    res.status(204).end();
  }));

  router.post('/jobs/:id/logs', asyncRoute(async (req, res) => {
    const jobId = jobIdParam(req.params.id);
    const input = logSchema.parse(req.body);
    await service.appendLog(req.connector!, jobId, input);
    res.status(204).end();
  }));

  router.post('/jobs/:id/batches', asyncRoute(async (req, res) => {
    const jobId = jobIdParam(req.params.id);
    const input = batchSchema.parse(req.body);
    const sourceHash = input.sourceHash ?? createHash('sha256').update(JSON.stringify(input.rows), 'utf8').digest('hex');
    await service.storeBatch(req.connector!, jobId, {
      sourceTable: input.sourceTable,
      batchNumber: input.batchNumber,
      rowCount: input.rows.length,
      sourceHash,
      rows: input.rows,
    });
    res.status(204).end();
  }));

  router.post('/jobs/:id/complete', asyncRoute(async (req, res) => {
    const jobId = jobIdParam(req.params.id);
    const input = completeSchema.parse(req.body ?? {});
    await service.complete(req.connector!, jobId, input.message ?? null);
    res.status(204).end();
  }));

  router.post('/jobs/:id/fail', asyncRoute(async (req, res) => {
    const jobId = jobIdParam(req.params.id);
    const input = failSchema.parse(req.body);
    await service.fail(req.connector!, jobId, input.error);
    res.status(204).end();
  }));

  return router;
}
