import { Router } from 'express';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import { csrf, requireMaster } from '../middleware/auth.js';
import type { SettingsService } from '../services/settings.service.js';

export function settingsRoutes(service:SettingsService){const r=Router();r.use(requireMaster);r.get('/',async(_req,res,next)=>{try{res.json({settings:await service.get()});}catch(e){next(e);}});r.put('/',csrf,async(req,res,next)=>{try{const b=z.object({signatureMode:z.enum(['ACCEPT','ACCEPT_AND_DRAW']),signatureLinkTtlMinutes:z.number().int(),acceptanceText:z.string()}).parse(req.body);await service.update(req.principal!.id,b,requestMeta(req));res.status(204).end();}catch(e){next(e);}});return r;}
