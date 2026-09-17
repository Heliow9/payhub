import { Router } from 'express';
import { z } from 'zod';
import { csrf, requireUser } from '../middleware/auth.js';
import type { ConnectorService, ImportJobType } from '../services/connector.service.js';
import { badRequest } from '../core/errors.js';

export function importJobsRoutes(service:ConnectorService){const r=Router();r.use(requireUser);
  r.get('/',async(req,res,next)=>{try{res.json({jobs:await service.listJobs(Number(req.query.limit??100))});}catch(e){next(e);}});
  r.get('/:id',async(req,res,next)=>{try{res.json({job:await service.getJob(Number(req.params.id))});}catch(e){next(e);}});
  r.get('/:id/logs',async(req,res,next)=>{try{res.json({logs:await service.listLogs(Number(req.params.id))});}catch(e){next(e);}});
  r.post('/',csrf,async(req,res,next)=>{try{const b=z.object({jobType:z.enum(['CONNECTION_TEST','SCHEMA_DISCOVERY','PAYROLL_IMPORT']),scope:z.record(z.string(),z.unknown()).nullable().optional()}).parse(req.body);if(b.jobType==='PAYROLL_IMPORT')throw badRequest('Use Funcionários ou Grupos para buscas de holerite. A importação técnica ampla foi bloqueada.');const id=await service.createJob({requestedByUserId:req.principal!.id,jobType:b.jobType as ImportJobType,scope:b.scope??null});res.status(201).json({id});}catch(e){next(e);}});
  return r;}
