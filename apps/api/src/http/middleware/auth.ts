import type { RequestHandler } from 'express';
import type { AuthService } from '../../domain/auth/auth.service.js';

export const SESSION_COOKIE = 'payhub_session';
export const CSRF_COOKIE = 'payhub_csrf';

export function requireAuth(auth: AuthService): RequestHandler {
  return async (req, res, next) => {
    try {
      const sessionToken = req.cookies?.[SESSION_COOKIE] as string | undefined;
      const resolved = sessionToken ? await auth.resolveSession(sessionToken) : null;
      if (!resolved) {
        res.status(401).json({ error: 'Sessão inválida ou expirada.' });
        return;
      }
      req.auth = resolved;
      next();
    } catch (error) {
      next(error);
    }
  };
}
