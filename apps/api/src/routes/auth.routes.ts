import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { normalizeCpf } from '../core/security.js';
import { requestMeta } from '../core/request.js';
import type { AuthService, LoginOutcome } from '../services/auth.service.js';
import { csrf, requireAuth, requireEmployee } from '../middleware/auth.js';

function retryAfterSeconds(req: any): number {
  const reset = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : Date.now() + 60_000;
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}

function loginLimiter(limit: number) {
  return rateLimit({
    windowMs: 15 * 60_000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      const retry = retryAfterSeconds(req);
      res.status(429).json({
        error: `Muitas tentativas de acesso. Aguarde ${Math.ceil(retry / 60)} minuto(s) e tente novamente.`,
        code: 'RATE_LIMITED',
        details: { retryAfterSeconds: retry },
      });
    },
  });
}

export function authRoutes(auth: AuthService, env: Env) {
  const r = Router();
  const mainLoginLimiter = loginLimiter(env.LOGIN_RATE_LIMIT);
  const firstAccessLimiter = loginLimiter(Math.max(5, Math.floor(env.LOGIN_RATE_LIMIT / 2)));
  const sendLogin = (res: any, result: LoginOutcome, client: 'WEB' | 'MOBILE') => {
    if ('requiresCompanySelection' in result) return res.json(result);
    if (client === 'WEB') res.cookie('payhub_session', result.token, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/', expires: result.expiresAt });
    return res.json({ principal: result.principal, csrfToken: result.csrfToken, ...(client === 'MOBILE' ? { accessToken: result.token, expiresAt: result.expiresAt.toISOString() } : {}) });
  };

  r.post('/login', mainLoginLimiter, async (req, res, next) => {
    try {
      const body = z.object({ identifier: z.string().min(1), password: z.string().min(1), client: z.enum(['WEB','MOBILE']).optional().default('WEB') }).parse(req.body);
      const numeric = /^\d/.test(body.identifier.trim());
      const result = numeric
        ? await auth.employeeLogin(normalizeCpf(body.identifier), body.password, requestMeta(req), body.client)
        : await auth.adminLogin(body.identifier, body.password, requestMeta(req));
      sendLogin(res, result, body.client);
    } catch (e) { next(e); }
  });

  r.post('/employee-first-access', firstAccessLimiter, async (req, res, next) => {
    try {
      const body = z.object({ cpf: z.string(), birthDate: z.string(), pin: z.string(), client: z.enum(['WEB','MOBILE']).optional().default('WEB') }).parse(req.body);
      const result = await auth.firstAccess(body.cpf, body.birthDate, body.pin, requestMeta(req), body.client);
      sendLogin(res, result, body.client);
    } catch (e) { next(e); }
  });

  r.post('/select-company', firstAccessLimiter, async (req, res, next) => {
    try {
      const body = z.object({ selectionToken: z.string().min(20), companyId: z.coerce.number().int().positive() }).parse(req.body);
      const result = await auth.selectEmployeeCompany(body.selectionToken, body.companyId, requestMeta(req));
      sendLogin(res, result, result.client ?? 'WEB');
    } catch (e) { next(e); }
  });

  r.post('/switch-company', requireEmployee, csrf, async (req, res, next) => {
    try {
      const body = z.object({ companyId: z.coerce.number().int().positive(), client: z.enum(['WEB','MOBILE']).optional().default('WEB') }).parse(req.body);
      const principal = req.principal!;
      if (principal.kind !== 'EMPLOYEE' || !req.sessionTokenHash) throw new Error('Contexto de funcionário ausente.');
      const result = await auth.switchEmployeeCompany(req.sessionTokenHash, principal, body.companyId, requestMeta(req));
      sendLogin(res, result, body.client);
    } catch (e) { next(e); }
  });

  // A ausência de sessão é um estado normal na tela de login, não um erro HTTP.
  r.get('/me', async (req, res, next) => {
    try {
      if (!req.principal) return res.json({ principal: null, csrfToken: '' });
      const csrfToken = await auth.refreshCsrf(req.sessionTokenHash, req.principal);
      return res.json({ principal: req.principal, csrfToken });
    } catch (e) { next(e); }
  });

  r.post('/logout', requireAuth, csrf, async (req, res, next) => {
    try {
      await auth.logout(req.sessionTokenHash, req.principal, requestMeta(req));
      res.clearCookie('payhub_session', { path: '/' });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}
