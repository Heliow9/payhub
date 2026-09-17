import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { Pool } from 'mysql2/promise';
import { ZodError } from 'zod';
import type { Env } from './config/env.js';
import { HttpError } from './core/errors.js';
import { authMiddleware } from './middleware/auth.js';
import { AuditService } from './services/audit.service.js';
import { AuthService } from './services/auth.service.js';
import { ConnectorService } from './services/connector.service.js';
import { EmployeeService } from './services/employee.service.js';
import { GroupService } from './services/group.service.js';
import { PayrollRunService } from './services/payroll-run.service.js';
import { PayrollService } from './services/payroll.service.js';
import { SettingsService } from './services/settings.service.js';
import { SignatureService } from './services/signature.service.js';
import { StorageService } from './services/storage.service.js';
import { NotificationService } from './services/notification.service.js';
import { authRoutes } from './routes/auth.routes.js';
import { usersRoutes } from './routes/users.routes.js';
import { employeesRoutes } from './routes/employees.routes.js';
import { groupsRoutes } from './routes/groups.routes.js';
import { connectorsRoutes } from './routes/connectors.routes.js';
import { importJobsRoutes } from './routes/import-jobs.routes.js';
import { connectorAgentRoutes } from './routes/connector-agent.routes.js';
import { payrollsRoutes } from './routes/payrolls.routes.js';
import { publicSignRoutes } from './routes/public-sign.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { auditRoutes } from './routes/audit.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { notificationsRoutes } from './routes/notifications.routes.js';

export interface PayHubServices {
  audit: AuditService; auth: AuthService; connector: ConnectorService; employees: EmployeeService; groups: GroupService;
  runs: PayrollRunService; payrolls: PayrollService; settings: SettingsService; signatures: SignatureService; storage: StorageService; notifications: NotificationService;
}

export function createServices(pool:Pool,env:Env):PayHubServices{
  const audit=new AuditService(pool);const auth=new AuthService(pool,env,audit);const connector=new ConnectorService(pool,audit);const storage=new StorageService(env.DOCUMENT_STORAGE_PATH);const notifications=new NotificationService(pool,env);const settings=new SettingsService(pool,audit);const employees=new EmployeeService(pool,connector,audit,storage);const groups=new GroupService(pool,audit);const runs=new PayrollRunService(pool,connector,audit);const payrolls=new PayrollService(pool,storage,audit,notifications);const signatures=new SignatureService(pool,storage,settings,audit,notifications,env);return{audit,auth,connector,employees,groups,runs,payrolls,settings,signatures,storage,notifications};
}

export function createApp(pool:Pool,env:Env,services=createServices(pool,env)){
  const app=express();app.set('trust proxy',1);app.disable('x-powered-by');app.use(helmet({crossOriginResourcePolicy:{policy:'same-site'}}));app.use(cors({origin:env.APP_ORIGIN,credentials:true}));app.use(express.json({limit:'2mb'}));app.use(cookieParser());app.use(authMiddleware(services.auth));
  app.use('/api/health',healthRoutes());app.use('/api/auth',authRoutes(services.auth,env));app.use('/api/dashboard',dashboardRoutes(pool));app.use('/api/users',usersRoutes(pool,services.auth));app.use('/api/employees',employeesRoutes(services.employees,services.runs));app.use('/api/groups',groupsRoutes(services.groups,services.runs));app.use('/api/connectors',connectorsRoutes(services.connector));app.use('/api/import-jobs',importJobsRoutes(services.connector));app.use('/api/connector-agent',connectorAgentRoutes(services.connector));app.use('/api/payrolls',payrollsRoutes(pool,services.payrolls,services.signatures,services.settings));app.use('/api/public/sign',publicSignRoutes(services.signatures));app.use('/api/settings',settingsRoutes(services.settings));app.use('/api/notifications',notificationsRoutes(services.notifications));app.use('/api/audit',auditRoutes(services.audit));
  app.use((_req,res)=>res.status(404).json({error:'Rota não encontrada.'}));
  const handler:ErrorRequestHandler=(error,_req,res,_next)=>{if(error instanceof ZodError){res.status(400).json({error:'Dados inválidos.',code:'VALIDATION_ERROR',details:error.issues});return;}if(error instanceof HttpError){res.status(error.statusCode).json({error:error.message,code:error.code,details:error.details});return;}console.error('[PayHub API]',error);res.status(500).json({error:'Erro interno do servidor.',code:'INTERNAL_ERROR'});};app.use(handler);return app;
}
