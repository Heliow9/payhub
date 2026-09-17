import { Router } from 'express';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import type { AuthService } from '../services/auth.service.js';
import { csrf, requireMaster } from '../middleware/auth.js';

export function usersRoutes(pool:Pool,auth:AuthService){const r=Router();r.use(requireMaster);
  r.get('/',async(_req,res,next)=>{try{const [rows]=await pool.query<RowDataPacket[]>(`SELECT id,name,email,role,status,created_at createdAt,updated_at updatedAt FROM users ORDER BY name`);res.json({users:rows});}catch(e){next(e);}});
  r.post('/',csrf,async(req,res,next)=>{try{const body=z.object({name:z.string(),email:z.string(),password:z.string()}).parse(req.body);const id=await auth.createAnalyst(req.principal!.id,body.name,body.email,body.password,requestMeta(req));res.status(201).json({id});}catch(e){next(e);}});
  r.patch('/:id/status',csrf,async(req,res,next)=>{try{const id=Number(req.params.id);const body=z.object({status:z.enum(['ACTIVE','DISABLED'])}).parse(req.body);await pool.execute(`UPDATE users SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND role='ANALISTA'`,[body.status,id]);res.status(204).end();}catch(e){next(e);}});return r;}
