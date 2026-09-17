import { Router } from 'express';
import { requireMaster } from '../middleware/auth.js';
import type { AuditService } from '../services/audit.service.js';
export function auditRoutes(service:AuditService){const r=Router();r.use(requireMaster);r.get('/',async(req,res,next)=>{try{res.json({logs:await service.list(Number(req.query.limit??250))});}catch(e){next(e);}});return r;}
