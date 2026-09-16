import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AuthService } from '../../domain/auth/auth.service.js';
import { csrfMatches } from '../../domain/auth/authorization.js';
import { asyncRoute, publicUser, requestContext } from '../http-utils.js';
import { CSRF_COOKIE, requireAuth, SESSION_COOKIE } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';

const loginSchema = z.object({
  email: z.string().email().max(190),
  password: z.string().min(1).max(256),
});

export interface AuthRouterConfig {
  cookieSecure: boolean;
  sessionTtlHours: number;
  loginRateLimit: number;
}

export function createAuthRouter(auth: AuthService, config: AuthRouterConfig) {
  const router = Router();
  const cookieBase = {
    secure: config.cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: config.sessionTtlHours * 60 * 60 * 1000,
  };

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Muitas tentativas de login. Tente novamente mais tarde.' },
  });

  router.post('/login', loginLimiter, asyncRoute(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const result = await auth.login({ ...input, ...requestContext(req) });

    res.cookie(SESSION_COOKIE, result.sessionToken, { ...cookieBase, httpOnly: true });
    res.cookie(CSRF_COOKIE, result.csrfToken, { ...cookieBase, httpOnly: false });
    res.json({
      user: publicUser(result.user),
      csrfToken: result.csrfToken,
      expiresAt: result.session.expiresAt,
    });
  }));

  router.get('/me', requireAuth(auth), (req, res) => {
    const csrfToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
    if (!req.auth || !csrfMatches(req.auth.session, csrfToken)) {
      res.status(403).json({ error: 'Token CSRF da sessão indisponível.' });
      return;
    }
    res.json({ user: publicUser(req.auth.user), csrfToken });
  });

  router.post('/logout', requireAuth(auth), requireCsrf(), asyncRoute(async (req, res) => {
    const sessionToken = req.cookies?.[SESSION_COOKIE] as string | undefined;
    await auth.logout(sessionToken ?? '', requestContext(req));
    res.clearCookie(SESSION_COOKIE, { secure: config.cookieSecure, sameSite: 'lax', path: '/' });
    res.clearCookie(CSRF_COOKIE, { secure: config.cookieSecure, sameSite: 'lax', path: '/' });
    res.status(204).send();
  }));

  return router;
}
