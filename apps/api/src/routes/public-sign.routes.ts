import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import type { SignatureService } from '../services/signature.service.js';
import { clientSignatureEvidenceSchema } from '../services/signature-client-evidence.js';

export function publicSignRoutes(service:SignatureService){const r=Router();const limiter=rateLimit({windowMs:15*60_000,limit:30,standardHeaders:true,legacyHeaders:false});r.use(limiter);r.get('/:token',async(req,res,next)=>{try{res.json(await service.publicInfo(String(req.params.token),requestMeta(req)));}catch(e){next(e);}});r.post('/:token/verify',async(req,res,next)=>{try{const b=z.object({pin:z.string().optional(),cpf:z.string().optional(),birthDate:z.string().optional(),newPin:z.string().optional()}).parse(req.body);res.json(await service.verifyLinkIdentity(req.params.token,b,requestMeta(req)));}catch(e){next(e);}});
  r.post('/:token/sign',async(req,res,next)=>{try{const b=z.object({pin:z.string().optional(),cpf:z.string().optional(),birthDate:z.string().optional(),newPin:z.string().optional(),drawing:z.string().optional(),clientEvidence:clientSignatureEvidenceSchema}).parse(req.body);res.json(await service.signFromLink(String(req.params.token),b,requestMeta(req)));}catch(e){next(e);}});return r;}
