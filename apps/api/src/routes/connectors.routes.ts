import { Router } from 'express';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import { csrf, requireMaster, requireUser } from '../middleware/auth.js';
import type { ConnectorService } from '../services/connector.service.js';

export function connectorsRoutes(service:ConnectorService){const r=Router();
  r.get('/',requireUser,async(_req,res,next)=>{try{res.json({connectors:await service.listConnectors()});}catch(e){next(e);}});
  r.post('/',requireMaster,csrf,async(req,res,next)=>{try{const {name}=z.object({name:z.string()}).parse(req.body);res.status(201).json(await service.createConnector(req.principal!.id,name,requestMeta(req)));}catch(e){next(e);}});
  return r;}
