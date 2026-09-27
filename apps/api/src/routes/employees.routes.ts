import { Router } from 'express';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import { contextFromPrincipal } from '../core/tenant.js';
import { csrf, requireEmployee, requireMaster, requireUser } from '../middleware/auth.js';
import type { EmployeeService } from '../services/employee.service.js';
import type { PayrollRunService } from '../services/payroll-run.service.js';

const manualSearchSchema=z.object({year:z.number().int().min(2000).max(2100),month:z.number().int().min(1).max(12),types:z.array(z.union([z.literal(2),z.literal(3),z.literal(4),z.literal(6)])).min(1)});

export function employeesRoutes(service:EmployeeService,runs:PayrollRunService){const r=Router();const context=(req:any)=>contextFromPrincipal(req.principal!);
  r.get('/me/profile',requireEmployee,async(req,res,next)=>{try{res.json({employee:await service.selfProfile(context(req) as any)});}catch(e){next(e);}});
  r.use(requireUser);
  r.get('/',async(req,res,next)=>{try{res.json(await service.list(context(req) as any,{search:req.query.search?String(req.query.search):undefined,groupId:req.query.groupId?Number(req.query.groupId):undefined,status:req.query.status?String(req.query.status):undefined,access:req.query.access?String(req.query.access):undefined,sageStatus:req.query.sageStatus?String(req.query.sageStatus):undefined,page:req.query.page?Number(req.query.page):1,pageSize:req.query.pageSize?Number(req.query.pageSize):25}));}catch(e){next(e);}});
  r.post('/lookup',csrf,async(req,res,next)=>{try{const{cpf}=z.object({cpf:z.string()}).parse(req.body);const jobId=await service.startLookup(context(req) as any,cpf,requestMeta(req));res.status(202).json({jobId});}catch(e){next(e);}});
  r.get('/lookup/:jobId/result',async(req,res,next)=>{try{res.json(await service.lookupResult(context(req) as any,Number(req.params.jobId)));}catch(e){next(e);}});
  r.get('/:id',async(req,res,next)=>{try{res.json({employee:await service.detail(context(req) as any,Number(req.params.id))});}catch(e){next(e);}});
  r.post('/',csrf,async(req,res,next)=>{try{const body=z.object({lookupJobId:z.number().int().positive(),groupId:z.number().int().positive(),phone:z.string().max(30).optional()}).parse(req.body);const id=await service.createFromLookup(context(req) as any,body.lookupJobId,body.groupId,body.phone,requestMeta(req));res.status(201).json({id});}catch(e){next(e);}});
  r.patch('/:id/group',csrf,async(req,res,next)=>{try{const{groupId}=z.object({groupId:z.number().int().positive()}).parse(req.body);await service.moveGroup(context(req) as any,Number(req.params.id),groupId,requestMeta(req));res.status(204).end();}catch(e){next(e);}});
  r.patch('/:id/status',csrf,async(req,res,next)=>{try{const{status}=z.object({status:z.enum(['ACTIVE','DISABLED','TERMINATED'])}).parse(req.body);await service.setStatus(context(req) as any,Number(req.params.id),status,requestMeta(req));res.status(204).end();}catch(e){next(e);}});
  r.post('/:id/sync-sage',csrf,async(req,res,next)=>{try{const jobId=await service.startSync(context(req) as any,Number(req.params.id),requestMeta(req));res.status(202).json({jobId});}catch(e){next(e);}});
  r.post('/:id/sync-sage/apply',csrf,async(req,res,next)=>{try{const{jobId}=z.object({jobId:z.number().int().positive()}).parse(req.body);await service.applySync(context(req) as any,Number(req.params.id),jobId,requestMeta(req));res.status(204).end();}catch(e){next(e);}});
  r.delete('/:id',requireMaster,csrf,async(req,res,next)=>{try{await service.deleteEmployee(context(req) as any,Number(req.params.id),requestMeta(req));res.status(204).end();}catch(e){next(e);}});
  r.post('/:id/search-now',csrf,async(req,res,next)=>{try{const body=manualSearchSchema.parse(req.body);res.status(202).json(await runs.startEmployee(context(req) as any,Number(req.params.id),body,requestMeta(req)));}catch(e){next(e);}});
  return r;
}
