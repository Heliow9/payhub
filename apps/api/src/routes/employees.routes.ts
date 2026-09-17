import { Router } from 'express';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import { csrf, requireMaster, requireUser } from '../middleware/auth.js';
import type { EmployeeService } from '../services/employee.service.js';
import type { PayrollRunService } from '../services/payroll-run.service.js';

const manualSearchSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  types: z.array(z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)])).min(1),
});

export function employeesRoutes(service: EmployeeService, runs: PayrollRunService) {
  const r = Router();
  r.use(requireUser);

  r.get('/', async (req, res, next) => { try { res.json({ employees: await service.list(String(req.query.search ?? '')) }); } catch (e) { next(e); } });
  r.get('/:id', async (req, res, next) => { try { res.json({ employee: await service.detail(Number(req.params.id)) }); } catch (e) { next(e); } });
  r.post('/lookup', csrf, async (req, res, next) => { try { const { cpf } = z.object({ cpf: z.string() }).parse(req.body); const jobId = await service.startLookup(req.principal!.id, cpf, requestMeta(req)); res.status(202).json({ jobId }); } catch (e) { next(e); } });
  r.get('/lookup/:jobId/result', async (req, res, next) => { try { res.json(await service.lookupResult(Number(req.params.jobId))); } catch (e) { next(e); } });
  r.post('/', csrf, async (req, res, next) => { try { const body = z.object({ lookupJobId: z.number().int().positive(), groupId: z.number().int().positive(), phone: z.string().max(30).optional() }).parse(req.body); const id = await service.createFromLookup(req.principal!.id, body.lookupJobId, body.groupId, body.phone, requestMeta(req)); res.status(201).json({ id }); } catch (e) { next(e); } });
  r.patch('/:id/group', csrf, async (req, res, next) => { try { const { groupId } = z.object({ groupId: z.number().int().positive() }).parse(req.body); await service.moveGroup(req.principal!.id, Number(req.params.id), groupId, requestMeta(req)); res.status(204).end(); } catch (e) { next(e); } });
  r.patch('/:id/status', csrf, async (req, res, next) => { try { const { status } = z.object({ status: z.enum(['ACTIVE', 'DISABLED', 'TERMINATED']) }).parse(req.body); await service.setStatus(req.principal!.id, Number(req.params.id), status, requestMeta(req)); res.status(204).end(); } catch (e) { next(e); } });
  r.post('/:id/sync-sage', csrf, async (req, res, next) => { try { const jobId=await service.startSync(req.principal!.id,Number(req.params.id),requestMeta(req)); res.status(202).json({jobId}); } catch (e) { next(e); } });
  r.post('/:id/sync-sage/apply', csrf, async (req, res, next) => { try { const {jobId}=z.object({jobId:z.number().int().positive()}).parse(req.body); await service.applySync(req.principal!.id,Number(req.params.id),jobId,requestMeta(req)); res.status(204).end(); } catch (e) { next(e); } });
  r.delete('/:id', requireMaster, csrf, async (req, res, next) => { try { await service.deleteEmployee(req.principal!.id, Number(req.params.id), requestMeta(req)); res.status(204).end(); } catch (e) { next(e); } });
  r.post('/:id/search-now', csrf, async (req, res, next) => {
    try {
      const body = manualSearchSchema.parse(req.body);
      res.status(202).json(await runs.startEmployee(req.principal!.id, Number(req.params.id), body, requestMeta(req)));
    } catch (e) { next(e); }
  });

  return r;
}
