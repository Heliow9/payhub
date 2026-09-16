import { Router } from 'express';
import { z } from 'zod';
import type { AuthService } from '../../domain/auth/auth.service.js';
import type { ConnectorService } from '../../domain/connectors/connector.service.js';
import { asyncRoute } from '../http-utils.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';

const scopeSchema = z.object({
  companyCode: z.union([z.string().trim().min(1), z.number().int()]).optional(),
  employeeCode: z.union([z.string().trim().min(1), z.number().int()]).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  types: z.array(z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)])).min(1).optional(),
  fromAdmission: z.boolean().optional(),
}).strict();

const createSchema = z.object({
  jobType: z.enum(['CONNECTION_TEST', 'SCHEMA_DISCOVERY', 'PAYROLL_IMPORT']),
  scope: scopeSchema.optional(),
});

export function createImportJobsRouter(auth: AuthService, service: ConnectorService) {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', asyncRoute(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const jobs = await service.listJobs(Number.isFinite(limit) ? limit : 100);
    res.json({ jobs });
  }));

  router.get('/:id/logs', asyncRoute(async (req, res) => {
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0) {
      res.status(400).json({ error: 'Job inválido.' });
      return;
    }
    const logs = await service.listJobLogs(jobId, 200);
    res.json({ logs });
  }));

  router.post('/', requireCsrf(), asyncRoute(async (req, res) => {
    const input = createSchema.parse(req.body);
    if (input.jobType === 'PAYROLL_IMPORT' && input.scope?.companyCode === undefined) {
      res.status(400).json({ error: 'companyCode é obrigatório para PAYROLL_IMPORT.' });
      return;
    }
    const job = await service.createJob(req.auth!.user, { jobType: input.jobType, scope: input.scope ?? null });
    res.status(201).json({ job });
  }));

  return router;
}
