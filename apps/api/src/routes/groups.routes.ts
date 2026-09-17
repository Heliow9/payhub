import { Router } from 'express';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import { csrf, requireUser } from '../middleware/auth.js';
import type { GroupService } from '../services/group.service.js';
import type { PayrollRunService } from '../services/payroll-run.service.js';

const groupSchema=z.object({name:z.string(),payrollTypes:z.array(z.number().int()),times:z.array(z.string()),autoSearchEnabled:z.boolean().default(true),status:z.enum(['ACTIVE','DISABLED']).optional()});
export function groupsRoutes(groups:GroupService,runs:PayrollRunService){const r=Router();r.use(requireUser);r.get('/',async(_req,res,next)=>{try{res.json({groups:await groups.list()});}catch(e){next(e);}});r.get('/:id',async(req,res,next)=>{try{res.json({group:await groups.get(Number(req.params.id))});}catch(e){next(e);}});r.post('/',csrf,async(req,res,next)=>{try{const b=groupSchema.parse(req.body);const id=await groups.create(req.principal!.id,b,requestMeta(req));res.status(201).json({id});}catch(e){next(e);}});r.put('/:id',csrf,async(req,res,next)=>{try{const b=groupSchema.extend({status:z.enum(['ACTIVE','DISABLED'])}).parse(req.body);await groups.update(req.principal!.id,Number(req.params.id),b,requestMeta(req));res.status(204).end();}catch(e){next(e);}});r.post('/:id/search-now',csrf,async(req,res,next)=>{try{res.status(202).json(await runs.startGroup(req.principal!.id,Number(req.params.id),requestMeta(req),'MANUAL'));}catch(e){next(e);}});return r;}
