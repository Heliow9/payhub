import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../core/errors.js';
import { sha256 } from '../core/security.js';
import type { AuthService } from '../services/auth.service.js';

export function authMiddleware(auth:AuthService){return async(req:Request,_res:Response,next:NextFunction)=>{try{const token=req.cookies?.payhub_session as string|undefined;const result=await auth.authenticate(token);if(result){req.principal=result.principal;req.sessionTokenHash=result.tokenHash;(req as Request & {csrfHash?:string}).csrfHash=result.csrfHash;}next();}catch(e){next(e);}};}
export function requireAuth(req:Request,_res:Response,next:NextFunction){if(!req.principal)return next(unauthorized('Autenticação necessária.'));next();}
export function requireUser(req:Request,_res:Response,next:NextFunction){if(!req.principal)return next(unauthorized('Autenticação necessária.'));if(req.principal.kind!=='USER')return next(forbidden());next();}
export function requireMaster(req:Request,_res:Response,next:NextFunction){if(!req.principal)return next(unauthorized('Autenticação necessária.'));if(req.principal.kind!=='USER'||req.principal.role!=='MASTER')return next(forbidden());next();}
export function requireEmployee(req:Request,_res:Response,next:NextFunction){if(!req.principal)return next(unauthorized('Autenticação necessária.'));if(req.principal.kind!=='EMPLOYEE')return next(forbidden());next();}
export function csrf(req:Request,_res:Response,next:NextFunction){if(!req.principal)return next(unauthorized('Autenticação necessária.'));const supplied=req.get('x-csrf-token');const expected=(req as Request & {csrfHash?:string}).csrfHash;if(!supplied||!expected||sha256(supplied)!==expected)return next(forbidden('Token CSRF inválido.'));next();}
