import {createHmac,timingSafeEqual} from 'node:crypto';
import type {NextFunction,Request,Response} from 'express';
import type {Pool,RowDataPacket} from 'mysql2/promise';
import type {Env} from '../config/env.js';
import {HttpError,unauthorized} from '../core/errors.js';

const safe=(a:string,b:string)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb)};
const body=(req:Request)=>JSON.stringify(req.body??{});
export function pontoCertoBridgeAuth(env:Env){return(req:Request,_res:Response,next:NextFunction)=>{
  const client=req.get('x-pc-client')||'',ts=req.get('x-pc-timestamp')||'',nonce=req.get('x-pc-nonce')||'',sig=req.get('x-pc-signature')||'';
  if(!env.PONTO_CERTO_BRIDGE_SECRET||client!==env.PONTO_CERTO_BRIDGE_CLIENT_ID)return next(unauthorized('Bridge não autorizado.'));
  const n=Number(ts);if(!Number.isFinite(n)||Math.abs(Date.now()-n)>300000||!nonce)return next(unauthorized('Assinatura do bridge expirada.'));
  const path=req.originalUrl.split('?')[0];const canonical=[req.method.toUpperCase(),path,ts,nonce,body(req)].join('\n');
  const expected=createHmac('sha256',env.PONTO_CERTO_BRIDGE_SECRET).update(canonical).digest('hex');
  if(!safe(sig,expected))return next(unauthorized('Assinatura do bridge inválida.'));next();
};}
export function financialAccessGuard(pool:Pool){return async(req:Request,_res:Response,next:NextFunction)=>{
  if(!req.principal)return next();
  const [rows]=await pool.execute<RowDataPacket[]>('SELECT financial_status,block_reason FROM company_licenses WHERE company_id=? LIMIT 1',[req.principal.companyId]);
  const lic=rows[0];if(lic&&String(lic.financial_status)==='BLOCKED')return next(new HttpError(402,String(lic.block_reason||'Acesso suspenso por bloqueio financeiro.'),'FINANCIAL_BLOCKED'));
  next();
};}
