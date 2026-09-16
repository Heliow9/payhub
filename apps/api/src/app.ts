import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { AuthService, InvalidCredentialsError } from './domain/auth/auth.service.js';
import type { AuditRepository } from './domain/audit/audit.repository.js';
import type { SessionRepository } from './domain/sessions/session.repository.js';
import { ForbiddenError, UserAdminService, UserValidationError } from './domain/users/user-admin.service.js';
import type { UserRepository } from './domain/users/user.repository.js';
import { createAuthRouter } from './http/routes/auth.routes.js';
import { createDashboardRouter } from './http/routes/dashboard.routes.js';
import { createHealthRouter } from './http/routes/health.routes.js';
import { createUsersRouter } from './http/routes/users.routes.js';

export interface AppConfig {
  appOrigin: string;
  cookieSecure: boolean;
  sessionTtlHours: number;
  loginRateLimit: number;
}

export interface AppDependencies {
  users: UserRepository;
  sessions: SessionRepository;
  audit: AuditRepository;
  config: AppConfig;
}

export function createApp(deps: AppDependencies) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: deps.config.appOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const auth = new AuthService(deps.users, deps.sessions, deps.audit, deps.config.sessionTtlHours);
  const userAdmin = new UserAdminService(deps.users, deps.audit);

  app.use('/api/health', createHealthRouter());
  app.use('/api/auth', createAuthRouter(auth, deps.config));
  app.use('/api/dashboard', createDashboardRouter(auth));
  app.use('/api/users', createUsersRouter(auth, userAdmin));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'Dados inválidos.', details: error.issues });
      return;
    }
    if (error instanceof InvalidCredentialsError) {
      res.status(401).json({ error: error.message });
      return;
    }
    if (error instanceof ForbiddenError) {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof UserValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('[PayHub API]', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  };
  app.use(errorHandler);

  return app;
}
