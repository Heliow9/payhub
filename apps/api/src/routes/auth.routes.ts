import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { normalizeCpf } from '../core/security.js';
import { requestMeta } from '../core/request.js';
import type { AuthService } from '../services/auth.service.js';
import { csrf, requireAuth } from '../middleware/auth.js';

export function authRoutes(auth:AuthService,env:Env){const r=Router();const limiter=rateLimit({windowMs:15*60_000,limit:env.LOGIN_RATE_LIMIT,standardHeaders:true,legacyHeaders:false});
  r.post('/login',limiter,async(req,res,next)=>{try{const body=z.object({identifier:z.string().min(1),password:z.string().min(1)}).parse(req.body);const numeric=/^\d/.test(body.identifier.trim());const result=numeric?await auth.employeeLogin(normalizeCpf(body.identifier),body.password,requestMeta(req)):await auth.adminLogin(body.identifier,body.password,requestMeta(req));res.cookie('payhub_session',result.token,{httpOnly:true,secure:env.COOKIE_SECURE,sameSite:'lax',path:'/',expires:result.expiresAt});res.json({principal:result.principal,csrfToken:result.csrfToken});}catch(e){next(e);}});
  r.post('/employee-first-access',limiter,async(req,res,next)=>{try{const body=z.object({cpf:z.string(),birthDate:z.string(),pin:z.string()}).parse(req.body);const result=await auth.firstAccess(body.cpf,body.birthDate,body.pin,requestMeta(req));res.cookie('payhub_session',result.token,{httpOnly:true,secure:env.COOKIE_SECURE,sameSite:'lax',path:'/',expires:result.expiresAt});res.json({principal:result.principal,csrfToken:result.csrfToken});}catch(e){next(e);}});
  r.get('/me',requireAuth,async(req,res,next)=>{try{const csrfToken=await auth.refreshCsrf(req.sessionTokenHash,req.principal);res.json({principal:req.principal,csrfToken});}catch(e){next(e);}});
  r.post('/logout',requireAuth,csrf,async(req,res,next)=>{try{await auth.logout(req.sessionTokenHash,req.principal,requestMeta(req));res.clearCookie('payhub_session',{path:'/'});res.status(204).end();}catch(e){next(e);}});
  return r;}
