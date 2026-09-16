import { Router } from 'express';
import { z } from 'zod';
import type { AuthService } from '../../domain/auth/auth.service.js';
import type { UserAdminService } from '../../domain/users/user-admin.service.js';
import { asyncRoute, publicUser, requestContext } from '../http-utils.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { requireRole } from '../middleware/rbac.js';

const createAnalystSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(190),
  password: z.string().min(10).max(256),
});

export function createUsersRouter(auth: AuthService, users: UserAdminService) {
  const router = Router();
  router.use(requireAuth(auth));
  router.use(requireRole('MASTER'));

  router.get('/', asyncRoute(async (req, res) => {
    const list = await users.list(req.auth!.user);
    res.json({ users: list.map(publicUser) });
  }));

  router.post('/', requireCsrf(), asyncRoute(async (req, res) => {
    const input = createAnalystSchema.parse(req.body);
    const user = await users.createAnalyst(req.auth!.user, input, requestContext(req));
    res.status(201).json({ user: publicUser(user) });
  }));

  return router;
}
