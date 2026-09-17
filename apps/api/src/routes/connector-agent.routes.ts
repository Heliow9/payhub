import { Router } from 'express';
import { z } from 'zod';
import type { ConnectorService } from '../services/connector.service.js';

function connectorAuth(service:ConnectorService){return async(req:any,_res:any,next:any)=>{try{const id=Number(req.get('x-payhub-connector-id'));const auth=req.get('authorization')??'';const token=auth.startsWith('Bearer ')?auth.slice(7):undefined;await service.authenticateConnector(id,token);req.connectorId=id;next();}catch(e){next(e);}};}
export function connectorAgentRoutes(service:ConnectorService){const r=Router();r.use(connectorAuth(service));
  r.post('/heartbeat',async(req,res,next)=>{try{const b=z.object({machineName:z.string().min(1),metadata:z.unknown().optional()}).parse(req.body);await service.heartbeat(req.connectorId!,b.machineName,b.metadata??{},req.ip??null);res.status(204).end();}catch(e){next(e);}});
  r.post('/jobs/next',async(req,res,next)=>{try{const job=await service.claimNext(req.connectorId!);if(!job)return res.status(204).end();res.json({job});}catch(e){next(e);}});
  r.post('/jobs/:id/progress',async(req,res,next)=>{try{const b=z.object({current:z.number().int().nonnegative(),total:z.number().int().nonnegative(),message:z.string().nullable().optional()}).parse(req.body);await service.progress(Number(req.params.id),req.connectorId!,b.current,b.total,b.message);res.status(204).end();}catch(e){next(e);}});
  r.post('/jobs/:id/logs',async(req,res,next)=>{try{const b=z.object({level:z.string(),message:z.string(),metadata:z.unknown().optional()}).parse(req.body);await service.appendLog(Number(req.params.id),req.connectorId!,b.level,b.message,b.metadata);res.status(204).end();}catch(e){next(e);}});
  r.post('/jobs/:id/batches',async(req,res,next)=>{try{const b=z.object({sourceTable:z.string(),batchNumber:z.number().int().nonnegative(),rows:z.array(z.unknown())}).parse(req.body);await service.storeBatch(Number(req.params.id),req.connectorId!,b.sourceTable,b.batchNumber,b.rows);res.status(204).end();}catch(e){next(e);}});
  r.post('/jobs/:id/complete',async(req,res,next)=>{try{const b=z.object({message:z.string().nullable().optional()}).parse(req.body??{});await service.complete(Number(req.params.id),req.connectorId!,b.message);res.status(204).end();}catch(e){next(e);}});
  r.post('/jobs/:id/fail',async(req,res,next)=>{try{const b=z.object({error:z.string().min(1)}).parse(req.body);await service.fail(Number(req.params.id),req.connectorId!,b.error);res.status(204).end();}catch(e){next(e);}});
  return r;}
