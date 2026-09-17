import type { Pool, RowDataPacket } from 'mysql2/promise';
import { badRequest } from '../core/errors.js';
import type { RequestMeta, SignatureMode } from '../core/types.js';
import { AuditService } from './audit.service.js';

export interface AppSettings{signatureMode:SignatureMode;signatureLinkTtlMinutes:number;acceptanceText:string;updatedAt:Date|null;}
export class SettingsService{
  constructor(private pool:Pool,private audit:AuditService){}
  async get():Promise<AppSettings>{const [rows]=await this.pool.query<RowDataPacket[]>(`SELECT signature_mode signatureMode,signature_link_ttl_minutes signatureLinkTtlMinutes,acceptance_text acceptanceText,updated_at updatedAt FROM app_settings WHERE id=1 LIMIT 1`);const row=rows[0];if(!row)return{signatureMode:'ACCEPT_AND_DRAW',signatureLinkTtlMinutes:1440,acceptanceText:'Declaro que visualizei o holerite, conferi seu conteúdo e manifesto eletronicamente minha ciência e recebimento.',updatedAt:null};return{signatureMode:row.signatureMode,signatureLinkTtlMinutes:Number(row.signatureLinkTtlMinutes),acceptanceText:String(row.acceptanceText),updatedAt:row.updatedAt??null};}
  async update(actorId:number,input:{signatureMode:SignatureMode;signatureLinkTtlMinutes:number;acceptanceText:string},meta:RequestMeta):Promise<void>{if(!['ACCEPT','ACCEPT_AND_DRAW'].includes(input.signatureMode))throw badRequest('Modo de assinatura inválido.');if(!Number.isInteger(input.signatureLinkTtlMinutes)||input.signatureLinkTtlMinutes<5||input.signatureLinkTtlMinutes>43200)throw badRequest('Validade do link deve estar entre 5 minutos e 30 dias.');if(input.acceptanceText.trim().length<20)throw badRequest('Texto de aceite muito curto.');await this.pool.execute(`UPDATE app_settings SET signature_mode=?,signature_link_ttl_minutes=?,acceptance_text=?,updated_by_user_id=?,updated_at=UTC_TIMESTAMP() WHERE id=1`,[input.signatureMode,input.signatureLinkTtlMinutes,input.acceptanceText.trim(),actorId]);await this.audit.record({actorUserId:actorId,action:'SIGNATURE_SETTINGS_UPDATED',targetType:'SETTINGS',targetId:'1',meta,metadata:{signatureMode:input.signatureMode,signatureLinkTtlMinutes:input.signatureLinkTtlMinutes}});}
}
