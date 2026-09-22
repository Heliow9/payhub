import { Router } from 'express';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import { csrf, requireUser } from '../middleware/auth.js';
import type { GroupService } from '../services/group.service.js';
import type { PayrollRunService } from '../services/payroll-run.service.js';
import { contextFromPrincipal } from '../core/tenant.js';

const weekdaysSchema = z.array(z.number().int().min(1).max(7)).min(1).default([1, 2, 3, 4, 5]);
const groupSchema = z.object({
  name: z.string(),
  payrollTypes: z.array(z.number().int()),
  times: z.array(z.string()),
  weekdays: weekdaysSchema,
  autoSearchEnabled: z.boolean().default(true),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

const manualSearchSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  types: z.array(z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)])).min(1),
});

export function groupsRoutes(groups: GroupService, runs: PayrollRunService) {
  const r = Router();
  r.use(requireUser);
  const context = (req: any) => contextFromPrincipal(req.principal!);

  r.get('/', async (req, res, next) => {
    try { res.json({ groups: await groups.list(context(req) as any) }); } catch (error) { next(error); }
  });
  r.get('/runs/:runId/events', async (req, res, next) => {
    try { res.json({ events: await runs.listEvents(context(req) as any, Number(req.params.runId)) }); } catch (error) { next(error); }
  });
  r.get('/:id/runs', async (req, res, next) => {
    try { res.json({ runs: await runs.listGroupRuns(context(req) as any, Number(req.params.id), Number(req.query.limit ?? 25)) }); } catch (error) { next(error); }
  });
  r.get('/:id', async (req, res, next) => {
    try { res.json({ group: await groups.get(context(req) as any, Number(req.params.id)) }); } catch (error) { next(error); }
  });
  r.post('/', csrf, async (req, res, next) => {
    try { const body = groupSchema.parse(req.body); const id = await groups.create(context(req) as any, body, requestMeta(req)); res.status(201).json({ id }); } catch (error) { next(error); }
  });
  r.put('/:id', csrf, async (req, res, next) => {
    try {
      const body = groupSchema.extend({ status: z.enum(['ACTIVE', 'DISABLED']) }).parse(req.body);
      await groups.update(context(req) as any, Number(req.params.id), body, requestMeta(req));
      res.status(204).end();
    } catch (error) { next(error); }
  });
  r.post('/:id/search-now', csrf, async (req, res, next) => {
    try {
      const body = manualSearchSchema.parse(req.body);
      res.status(202).json(await runs.startGroup(context(req) as any, Number(req.params.id), requestMeta(req), 'MANUAL', body));
    } catch (error) { next(error); }
  });
  return r;
}
