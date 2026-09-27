import { Router } from 'express';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import { csrf, requireMaster, requireUser } from '../middleware/auth.js';
import type { SettingsService } from '../services/settings.service.js';

const payrollTypesSchema = z.array(
  z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)]),
).max(4);

export function settingsRoutes(service: SettingsService) {
  const r = Router();

  r.get('/payroll-types', requireUser, async (req, res, next) => {
    try {
      const settings = await service.get(req.principal!.companyId);
      res.json({ enabledPayrollTypes: settings.enabledPayrollTypes });
    } catch (error) { next(error); }
  });

  r.use(requireMaster);

  r.get('/', async (req, res, next) => {
    try { res.json({ settings: await service.get(req.principal!.companyId) }); }
    catch (error) { next(error); }
  });

  r.put('/', csrf, async (req, res, next) => {
    try {
      const body = z.object({
        signatureMode: z.enum(['ACCEPT', 'ACCEPT_AND_DRAW']),
        signatureLinkTtlMinutes: z.number().int(),
        acceptanceText: z.string(),
        enabledPayrollTypes: payrollTypesSchema.optional(),
      }).parse(req.body);
      await service.update(req.principal!.companyId, req.principal!.id, body, requestMeta(req));
      res.status(204).end();
    } catch (error) { next(error); }
  });

  return r;
}
