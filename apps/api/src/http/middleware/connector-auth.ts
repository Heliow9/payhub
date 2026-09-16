import type { RequestHandler } from 'express';
import type { ConnectorService } from '../../domain/connectors/connector.service.js';

export function requireConnectorAuth(service: ConnectorService): RequestHandler {
  return async (req, res, next) => {
    try {
      const connectorId = Number(req.get('x-payhub-connector-id'));
      const authorization = req.get('authorization') ?? '';
      const [scheme, token] = authorization.split(' ', 2);
      if (scheme?.toLowerCase() !== 'bearer' || !token) {
        res.status(401).json({ error: 'Credenciais do conector obrigatórias.' });
        return;
      }
      req.connector = await service.authenticate(connectorId, token);
      next();
    } catch (error) {
      next(error);
    }
  };
}
