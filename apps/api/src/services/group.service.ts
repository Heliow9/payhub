import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { parseJson } from '../core/json.js';
import type { RequestMeta } from '../core/types.js';
import { AuditService } from './audit.service.js';

const allowedTypes=[2,3,4,6];
function normalizeTypes(types:number[]):number[]{const unique=[...new Set(types.map(Number))].filter((v)=>allowedTypes.includes(v));if(unique.length===0)throw badRequest('Selecione pelo menos um tipo de folha.');return unique.sort((a,b)=>a-b);}
function normalizeTimes(times:string[]):string[]{const unique=[...new Set(times.map((t)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)?`${t}:00`:t).filter((t)=>/^([01]\d|2[0-3]):[0-5]\d:00$/.test(t)))];if(unique.length===0)throw badRequest('Informe pelo menos um horário válido.');return unique.sort();}

export class GroupService{
  constructor(private pool:Pool,private audit:AuditService){}

  async list():Promise<Record<string,unknown>[]>{
    const [groups]=await this.pool.query<RowDataPacket[]>(`SELECT g.id,g.name,g.company_code companyCode,g.payroll_types_json payrollTypesJson,g.auto_search_enabled autoSearchEnabled,g.status,g.created_at createdAt,g.updated_at updatedAt,COUNT(e.id) employeeCount FROM employee_groups g LEFT JOIN employees e ON e.group_id=g.id AND e.status='ACTIVE' GROUP BY g.id ORDER BY g.name`);
    const [schedules]=await this.pool.query<RowDataPacket[]>(`SELECT id,group_id groupId,TIME_FORMAT(run_time,'%H:%i') runTime,enabled FROM group_schedules ORDER BY run_time`);
    return groups.map((g)=>({...g,payrollTypes:parseJson<number[]>(g.payrollTypesJson,[]),payrollTypesJson:undefined,schedules:schedules.filter((s)=>Number(s.groupId)===Number(g.id))}));
  }

  async get(id:number):Promise<Record<string,unknown>>{const rows=await this.list();const group=rows.find((g)=>Number(g.id)===id);if(!group)throw notFound('Grupo não encontrado.');return group;}

  async create(actorId:number,input:{name:string;payrollTypes:number[];times:string[];autoSearchEnabled?:boolean},meta:RequestMeta):Promise<number>{
    const name=input.name.trim();if(name.length<2)throw badRequest('Nome do grupo inválido.');const types=normalizeTypes(input.payrollTypes);const times=normalizeTimes(input.times);
    const conn=await this.pool.getConnection();try{await conn.beginTransaction();const [result]=await conn.execute<ResultSetHeader>(`INSERT INTO employee_groups (name,company_code,payroll_types_json,auto_search_enabled,status,created_by_user_id,created_at,updated_at) VALUES (?,'1',?,?,'ACTIVE',?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[name,JSON.stringify(types),input.autoSearchEnabled===false?0:1,actorId]);for(const time of times)await conn.execute(`INSERT INTO group_schedules (group_id,run_time,enabled,created_at) VALUES (?,?,1,UTC_TIMESTAMP())`,[result.insertId,time]);await conn.commit();await this.audit.record({actorUserId:actorId,action:'GROUP_CREATED',targetType:'GROUP',targetId:result.insertId,meta,metadata:{types,times}});return result.insertId;}catch(error){await conn.rollback();if((error as {code?:string}).code==='ER_DUP_ENTRY')throw conflict('Já existe um grupo com este nome.');throw error;}finally{conn.release();}
  }

  async update(actorId:number,id:number,input:{name:string;payrollTypes:number[];times:string[];autoSearchEnabled:boolean;status:'ACTIVE'|'DISABLED'},meta:RequestMeta):Promise<void>{
    const name=input.name.trim();const types=normalizeTypes(input.payrollTypes);const times=normalizeTimes(input.times);const conn=await this.pool.getConnection();try{await conn.beginTransaction();const [result]=await conn.execute<ResultSetHeader>(`UPDATE employee_groups SET name=?,company_code='1',payroll_types_json=?,auto_search_enabled=?,status=?,updated_at=UTC_TIMESTAMP() WHERE id=?`,[name,JSON.stringify(types),input.autoSearchEnabled?1:0,input.status,id]);if(result.affectedRows===0)throw notFound('Grupo não encontrado.');await conn.execute(`DELETE FROM group_schedules WHERE group_id=?`,[id]);for(const time of times)await conn.execute(`INSERT INTO group_schedules (group_id,run_time,enabled,created_at) VALUES (?,?,1,UTC_TIMESTAMP())`,[id,time]);await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}await this.audit.record({actorUserId:actorId,action:'GROUP_UPDATED',targetType:'GROUP',targetId:id,meta,metadata:{types,times,status:input.status}});
  }
}
