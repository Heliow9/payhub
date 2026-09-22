import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import type { DocumentVerificationService } from '../services/document-verification.service.js';

export function publicVerificationRoutes(service:DocumentVerificationService){
  const r=Router();
  r.use(rateLimit({windowMs:15*60_000,limit:60,standardHeaders:true,legacyHeaders:false}));
  r.get('/:documentNumber',async(req,res,next)=>{
    try{res.json(await service.verify(String(req.params.documentNumber),requestMeta(req)));}catch(e){next(e);}
  });
  r.post('/:documentNumber/file-hash',async(req,res,next)=>{
    try{
      const body=z.object({sha256:z.string().length(64)}).parse(req.body);
      res.json(await service.compareFileHash(String(req.params.documentNumber),body.sha256,requestMeta(req)));
    }catch(e){next(e);}
  });
  return r;
}
