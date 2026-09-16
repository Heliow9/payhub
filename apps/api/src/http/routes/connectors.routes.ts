import { Router } from 'express';
import { z } from 'zod';
import type { AuthService } from '../../domain/auth/auth.service.js';
import type { ConnectorService } from '../../domain/connectors/connector.service.js';
import { asyncRoute, requestContext } from '../http-utils.js';
import { requireAuth } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { requireRole } from '../middleware/rbac.js';

const createSchema = z.object({ name: z.string().trim().min(2).max(120) });

function publicConnector(connector: Awaited<ReturnType<ConnectorService['listConnectors']>>[number]) {
  const stale = connector.status === 'ONLINE' && connector.lastSeenAt && Date.now() - connector.lastSeenAt.getTime() > 120_000;
  return {
    id: connector.id,
    name: connector.name,
    machineName: connector.machineName,
    status: stale ? 'OFFLINE' : connector.status,
    lastSeenAt: connector.lastSeenAt,
    lastIpAddress: connector.lastIpAddress,
    metadata: connector.metadata,
    createdByUserId: connector.createdByUserId,
    createdAt: connector.createdAt,
    updatedAt: connector.updatedAt,
  };
}

export function createConnectorsRouter(auth: AuthService, service: ConnectorService) {
  const router = Router();
  router.use(requireAuth(auth));

  router.get('/', asyncRoute(async (_req, res) => {
    const connectors = await service.listConnectors();
    res.json({ connectors: connectors.map(publicConnector) });
  }));

  router.post('/', requireRole('MASTER'), requireCsrf(), asyncRoute(async (req, res) => {
    const input = createSchema.parse(req.body);
    const result = await service.createConnector(req.auth!.user, input.name, requestContext(req));
    res.status(201).json({ connector: publicConnector(result.connector), token: result.token });
  }));

  return router;
}
