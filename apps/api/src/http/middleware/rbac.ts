import type { RequestHandler } from 'express';
import { canAccessRole } from '../../domain/auth/authorization.js';
import type { UserRole } from '../../domain/auth/types.js';

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Autenticação obrigatória.' });
      return;
    }
    if (!canAccessRole(req.auth.user.role, roles)) {
      res.status(403).json({ error: 'Acesso negado.' });
      return;
    }
    next();
  };
}
