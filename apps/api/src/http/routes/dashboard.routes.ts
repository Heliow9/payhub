import { Router } from 'express';
import type { AuthService } from '../../domain/auth/auth.service.js';
import { publicUser } from '../http-utils.js';
import { requireAuth } from '../middleware/auth.js';

export function createDashboardRouter(auth: AuthService) {
  const router = Router();
  router.get('/summary', requireAuth(auth), (req, res) => {
    res.json({
      user: publicUser(req.auth!.user),
      platform: { name: 'PayHub', stage: 'Core Platform', status: 'ACTIVE' },
      modules: [
        { key: 'core', label: 'Core Platform', status: 'ACTIVE' },
        { key: 'sage_connector', label: 'Conector Sage (.NET 8)', status: 'NEXT_STAGE' },
        { key: 'payroll_import', label: 'Importação e normalização', status: 'PLANNED' },
        { key: 'payslips', label: 'Holerites', status: 'PLANNED' },
        { key: 'signatures', label: 'Assinaturas', status: 'PLANNED' },
      ],
    });
  });
  return router;
}
