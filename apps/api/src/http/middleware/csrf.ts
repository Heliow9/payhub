import type { RequestHandler } from 'express';
import { csrfMatches } from '../../domain/auth/authorization.js';

export function requireCsrf(): RequestHandler {
  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Autenticação obrigatória.' });
      return;
    }
    const token = req.get('x-csrf-token');
    if (!csrfMatches(req.auth.session, token)) {
      res.status(403).json({ error: 'Token CSRF inválido.' });
      return;
    }
    next();
  };
}
