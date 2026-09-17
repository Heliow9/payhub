import { Router } from 'express';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import { csrf, requireEmployee, requireUser } from '../middleware/auth.js';
import type { PayrollService } from '../services/payroll.service.js';
import type { SignatureService } from '../services/signature.service.js';
import type { SettingsService } from '../services/settings.service.js';

export function payrollsRoutes(pool:Pool,payrolls:PayrollService,signatures:SignatureService,settings:SettingsService){const r=Router();
  r.get('/',requireUser,async(req,res,next)=>{try{res.json({payrolls:await payrolls.listAdmin({employeeId:req.query.employeeId?Number(req.query.employeeId):undefined,groupId:req.query.groupId?Number(req.query.groupId):undefined,year:req.query.year?Number(req.query.year):undefined,month:req.query.month?Number(req.query.month):undefined,status:req.query.status?String(req.query.status):undefined,type:req.query.type?Number(req.query.type):undefined})});}catch(e){next(e);}});
  r.get('/employee/me',requireEmployee,async(req,res,next)=>{try{res.json({payrolls:await payrolls.listEmployee(req.principal!.id)});}catch(e){next(e);}});
  r.get('/employee/:id',requireEmployee,async(req,res,next)=>{try{const id=Number(req.params.id);await payrolls.markViewed(id,req.principal!.id,requestMeta(req));res.json({payroll:await payrolls.detail(id,req.principal!.id)});}catch(e){next(e);}});
  r.get('/employee/:id/download',requireEmployee,async(req,res,next)=>{try{const doc=await payrolls.employeeDownload(Number(req.params.id),req.principal!.id,requestMeta(req));res.type('application/pdf').setHeader('Content-Disposition',`attachment; filename="${doc.filename}"`).send(doc.buffer);}catch(e){next(e);}});
  r.post('/employee/:id/sign',requireEmployee,csrf,async(req,res,next)=>{try{const b=z.object({pin:z.string(),drawing:z.string().optional(),origin:z.enum(['PORTAL','PWA','ANDROID']).default('PWA')}).parse(req.body);res.json(await signatures.signFromPortal(req.principal!.id,Number(req.params.id),b.pin,b.drawing,b.origin,requestMeta(req),req.sessionTokenHash));}catch(e){next(e);}});
  r.get('/:id',requireUser,async(req,res,next)=>{try{res.json({payroll:await payrolls.detail(Number(req.params.id))});}catch(e){next(e);}});
  r.get('/:id/download',requireUser,async(req,res,next)=>{try{const doc=await payrolls.originalDocument(Number(req.params.id));await pool.execute(`INSERT INTO document_access_logs (payroll_id,actor_type,actor_id,action,ip_address,user_agent,created_at) VALUES (?,'USER',?,'DOWNLOAD',?,?,UTC_TIMESTAMP())`,[Number(req.params.id),req.principal!.id,req.ip??null,req.get('user-agent')??null]);res.type('application/pdf').setHeader('Content-Disposition',`attachment; filename="${doc.filename}"`).send(doc.buffer);}catch(e){next(e);}});
  r.post('/:id/release',requireUser,csrf,async(req,res,next)=>{try{const cfg=await settings.get();const requestId=await payrolls.release(req.principal!.id,Number(req.params.id),cfg.acceptanceText,requestMeta(req));res.json({requestId});}catch(e){next(e);}});
  r.post('/:id/signature-link',requireUser,csrf,async(req,res,next)=>{try{const b=z.object({ttlMinutes:z.number().int().optional()}).parse(req.body??{});res.json(await signatures.createLink(req.principal!.id,Number(req.params.id),requestMeta(req),b.ttlMinutes));}catch(e){next(e);}});
  r.get('/:id/evidence',requireUser,async(req,res,next)=>{try{res.json({evidence:await signatures.evidence(Number(req.params.id))});}catch(e){next(e);}});
  r.get('/:id/evidence/drawing',requireUser,async(req,res,next)=>{try{const drawing=await signatures.drawing(Number(req.params.id));res.type('image/png').setHeader('Content-Disposition',`inline; filename="${drawing.filename}"`).setHeader('Cache-Control','private, no-store').send(drawing.buffer);}catch(e){next(e);}});
  r.get('/report/csv/all',requireUser,async(req,res,next)=>{try{const rows=await payrolls.listAdmin({});const header=['Funcionario','CPF','Grupo','Competencia','Tipo','Status','Bruto','Descontos','Liquido'];const esc=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;const body=[header.join(';'),...rows.map((p:any)=>[p.employeeName,p.cpf,p.groupName,`${String(p.month).padStart(2,'0')}/${p.year}`,p.payrollTypeLabel,p.status,p.grossAmount,p.deductionAmount,p.netAmount].map(esc).join(';'))].join('\n');res.type('text/csv; charset=utf-8').setHeader('Content-Disposition','attachment; filename="payhub-holerites.csv"').send('\uFEFF'+body);}catch(e){next(e);}});
  return r;}
