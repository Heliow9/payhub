import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { badRequest, notFound } from '../core/errors.js';
import { maskCpf } from '../core/security.js';
import { parseJson } from '../core/json.js';
import type { RequestMeta } from '../core/types.js';
import { AuditService } from './audit.service.js';
import { buildPayrollPdf } from './pdf.service.js';
import { StorageService } from './storage.service.js';
import { normalizePayrollBatches, type SourceBatch } from './normalizer.service.js';

export class PayrollService{
  constructor(private pool:Pool,private storage:StorageService,private audit:AuditService){}

  async normalizeCompletedJob(jobId:number):Promise<{created:number;unchanged:number;skipped:number}>{
    const [jobRows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,payroll_run_id payrollRunId,scope_json scopeJson,status,normalized_at normalizedAt FROM import_jobs WHERE id=? LIMIT 1`,[jobId]);
    const job=jobRows[0];if(!job||job.status!=='COMPLETED'||job.normalizedAt)return{created:0,unchanged:0,skipped:0};
    const scope=parseJson<{employeeCodes?:string[]}>(job.scopeJson,{});const target=scope.employeeCodes??[];
    const [batchRows]=await this.pool.execute<RowDataPacket[]>(`SELECT source_table sourceTable,payload_json payload FROM connector_raw_batches WHERE job_id=? ORDER BY source_table,batch_number`,[jobId]);
    const batches:SourceBatch[]=batchRows.map((b)=>({sourceTable:String(b.sourceTable),rows:parseJson<Array<Record<string,unknown>>>(b.payload,[])}));
    const normalized=normalizePayrollBatches(batches,target);let created=0,unchanged=0,skipped=0;
    for(const p of normalized){
      const [employeeRows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,name,cpf,sage_employee_code sageCode FROM employees WHERE company_code='1' AND sage_employee_code=? AND status='ACTIVE' LIMIT 1`,[p.sageEmployeeCode]);
      const employee=employeeRows[0];if(!employee){skipped++;continue;}
      const [currentRows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,version,source_hash sourceHash,status FROM payrolls WHERE employee_id=? AND year=? AND month=? AND payroll_type=? AND is_current=1 ORDER BY version DESC LIMIT 1`,[employee.id,p.year,p.month,p.payrollType]);
      const current=currentRows[0];if(current&&String(current.sourceHash)===p.sourceHash){unchanged++;continue;}
      const version=current?Number(current.version)+1:1;
      const conn=await this.pool.getConnection();let payrollId=0;
      try{
        await conn.beginTransaction();
        if(current){await conn.execute(`UPDATE payrolls SET is_current=0,status=IF(status='SIGNED',status,'REPLACED'),updated_at=UTC_TIMESTAMP() WHERE id=?`,[current.id]);}
        const summary={employeeName:String(employee.name),competence:`${String(p.month).padStart(2,'0')}/${p.year}`,typeLabel:p.payrollTypeLabel,gross:p.gross,deductions:p.deductions,net:p.net,itemCount:p.items.length};
        const [insert]=await conn.execute<ResultSetHeader>(`INSERT INTO payrolls (employee_id,payroll_run_id,company_code,sage_employee_code,year,month,payroll_type,payroll_type_label,version,is_current,status,gross_amount,deduction_amount,net_amount,source_hash,summary_json,raw_reference_json,created_at,updated_at) VALUES (?,?,'1',?,?,?,?,?, ?,1,'PROCESSING',?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[employee.id,job.payrollRunId??null,p.sageEmployeeCode,p.year,p.month,p.payrollType,p.payrollTypeLabel,version,p.gross,p.deductions,p.net,p.sourceHash,JSON.stringify(summary),JSON.stringify(p.rawReference)]);
        payrollId=insert.insertId;
        let order=0;for(const item of p.items){await conn.execute(`INSERT INTO payroll_items (payroll_id,event_code,description,reference_value,amount,nature,sort_order) VALUES (?,?,?,?,?,?,?)`,[payrollId,item.code,item.description,item.reference,item.amount,item.nature,order++]);}
        await conn.commit();
      }catch(error){await conn.rollback();throw error;}finally{conn.release();}
      try{
        const pdf=buildPayrollPdf({employeeName:String(employee.name),cpfMasked:maskCpf(String(employee.cpf)),sageCode:String(employee.sageCode),competence:`${String(p.month).padStart(2,'0')}/${p.year}`,typeLabel:p.payrollTypeLabel,gross:p.gross,deductions:p.deductions,net:p.net,items:p.items.map((i)=>({code:i.code,description:i.description,reference:i.reference,amount:i.amount,nature:i.nature})),footer:['Documento gerado pelo PayHub a partir dos dados de folha recebidos do Sage. O hash SHA-256 é preservado para controle de integridade.']});
        const relative=`payrolls/${employee.id}/${p.year}/${String(p.month).padStart(2,'0')}/${p.payrollType}/v${version}/original.pdf`;const stored=await this.storage.write(relative,pdf);
        await this.pool.execute(`INSERT INTO payroll_documents (payroll_id,original_path,original_sha256,created_at,updated_at) VALUES (?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[payrollId,stored.path,stored.sha256]);
        await this.pool.execute(`UPDATE payrolls SET status='READY',updated_at=UTC_TIMESTAMP() WHERE id=?`,[payrollId]);created++;
      }catch(error){await this.pool.execute(`UPDATE payrolls SET status='ERROR',updated_at=UTC_TIMESTAMP() WHERE id=?`,[payrollId]);throw error;}
    }
    await this.pool.execute(`UPDATE import_jobs SET normalized_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?`,[jobId]);
    if(job.payrollRunId){const status=skipped>0?'PARTIAL':'COMPLETED';await this.pool.execute(`UPDATE payroll_runs SET status=?,success_count=?,failure_count=?,message=?,finished_at=UTC_TIMESTAMP() WHERE id=?`,[status,created+unchanged,skipped,`${created} novo(s), ${unchanged} sem alteração, ${skipped} ignorado(s).`,job.payrollRunId]);}
    return{created,unchanged,skipped};
  }

  async listAdmin(filters:{employeeId?:number;groupId?:number;year?:number;month?:number;status?:string;type?:number}={}):Promise<Record<string,unknown>[]>{
    const where=['p.is_current=1'];const params:unknown[]=[];if(filters.employeeId){where.push('p.employee_id=?');params.push(filters.employeeId);}if(filters.groupId){where.push('e.group_id=?');params.push(filters.groupId);}if(filters.year){where.push('p.year=?');params.push(filters.year);}if(filters.month){where.push('p.month=?');params.push(filters.month);}if(filters.status){where.push('p.status=?');params.push(filters.status);}if(filters.type){where.push('p.payroll_type=?');params.push(filters.type);}
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.id,p.employee_id employeeId,e.name employeeName,e.cpf,e.group_id groupId,g.name groupName,p.year,p.month,p.payroll_type payrollType,p.payroll_type_label payrollTypeLabel,p.version,p.status,p.gross_amount grossAmount,p.deduction_amount deductionAmount,p.net_amount netAmount,p.released_at releasedAt,p.signed_at signedAt,p.created_at createdAt,d.original_sha256 originalSha256,d.signed_sha256 signedSha256 FROM payrolls p JOIN employees e ON e.id=p.employee_id JOIN employee_groups g ON g.id=e.group_id LEFT JOIN payroll_documents d ON d.payroll_id=p.id WHERE ${where.join(' AND ')} ORDER BY p.year DESC,p.month DESC,e.name ASC,p.payroll_type ASC LIMIT 1000`,params);return rows;
  }

  async listEmployee(employeeId:number):Promise<Record<string,unknown>[]>{const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.id,p.year,p.month,p.payroll_type payrollType,p.payroll_type_label payrollTypeLabel,p.status,p.gross_amount grossAmount,p.deduction_amount deductionAmount,p.net_amount netAmount,p.released_at releasedAt,p.signed_at signedAt FROM payrolls p WHERE p.employee_id=? AND p.is_current=1 AND p.status IN ('SIGNATURE_REQUESTED','VIEWED','SIGNED') ORDER BY p.year DESC,p.month DESC,p.payroll_type`,[employeeId]);return rows;}

  async detail(payrollId:number,employeeId?:number):Promise<Record<string,unknown>>{
    const params:unknown[]=[payrollId];let employeeClause='';if(employeeId){employeeClause=' AND p.employee_id=? AND p.status IN (\'SIGNATURE_REQUESTED\',\'VIEWED\',\'SIGNED\')';params.push(employeeId);}
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.*,e.name employeeName,e.cpf,e.sage_employee_code sageCode,g.name groupName,d.original_sha256 originalSha256,d.signed_sha256 signedSha256,d.receipt_sha256 receiptSha256,sr.id signatureRequestId,sr.status signatureStatus,sr.acceptance_text acceptanceText,aset.signature_mode signatureMode FROM payrolls p JOIN employees e ON e.id=p.employee_id JOIN employee_groups g ON g.id=e.group_id LEFT JOIN payroll_documents d ON d.payroll_id=p.id LEFT JOIN signature_requests sr ON sr.payroll_id=p.id LEFT JOIN app_settings aset ON aset.id=1 WHERE p.id=? ${employeeClause} LIMIT 1`,params);const row=rows[0];if(!row)throw notFound('Holerite não encontrado.');
    const [items]=await this.pool.execute<RowDataPacket[]>(`SELECT event_code eventCode,description,reference_value referenceValue,amount,nature,sort_order sortOrder FROM payroll_items WHERE payroll_id=? ORDER BY sort_order,id`,[payrollId]);return{...row,summary:parseJson(row.summary_json,{}),summary_json:undefined,rawReference:parseJson(row.raw_reference_json,{}),raw_reference_json:undefined,items};
  }

  async release(actorId:number,payrollId:number,acceptanceText:string,meta:RequestMeta):Promise<number>{
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT employee_id employeeId,status FROM payrolls WHERE id=? AND is_current=1 LIMIT 1`,[payrollId]);const row=rows[0];if(!row)throw notFound('Holerite não encontrado.');if(!['READY','SIGNATURE_REQUESTED','VIEWED'].includes(String(row.status)))throw badRequest('Este holerite não pode ser liberado neste status.');
    const {sha256}=await import('../core/security.js');const hash=sha256(acceptanceText);
    await this.pool.execute(`INSERT INTO signature_requests (payroll_id,employee_id,requested_by_user_id,status,acceptance_text,acceptance_text_hash,requested_at) VALUES (?,?,?,'PENDING',?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE requested_by_user_id=VALUES(requested_by_user_id),status=IF(status='SIGNED',status,'PENDING'),acceptance_text=VALUES(acceptance_text),acceptance_text_hash=VALUES(acceptance_text_hash),requested_at=IF(status='SIGNED',requested_at,UTC_TIMESTAMP())`,[payrollId,row.employeeId,actorId,acceptanceText,hash]);
    await this.pool.execute(`UPDATE payrolls SET status=IF(status='SIGNED',status,'SIGNATURE_REQUESTED'),released_at=COALESCE(released_at,UTC_TIMESTAMP()),updated_at=UTC_TIMESTAMP() WHERE id=?`,[payrollId]);
    const [requestRows]=await this.pool.execute<RowDataPacket[]>(`SELECT id FROM signature_requests WHERE payroll_id=? LIMIT 1`,[payrollId]);const requestId=Number(requestRows[0]!.id);
    await this.audit.record({actorUserId:actorId,action:'PAYROLL_SIGNATURE_REQUESTED',targetType:'PAYROLL',targetId:payrollId,meta,metadata:{signatureRequestId:requestId}});return requestId;
  }

  async markViewed(payrollId:number,employeeId:number,meta:RequestMeta):Promise<void>{await this.pool.execute(`UPDATE payrolls SET status=IF(status='SIGNATURE_REQUESTED','VIEWED',status),updated_at=UTC_TIMESTAMP() WHERE id=? AND employee_id=?`,[payrollId,employeeId]);await this.pool.execute(`INSERT INTO document_access_logs (payroll_id,actor_type,actor_id,action,ip_address,user_agent,created_at) VALUES (?,'EMPLOYEE',?,'VIEW_FULL',?,?,UTC_TIMESTAMP())`,[payrollId,employeeId,meta.ipAddress,meta.userAgent]);}

  async originalDocument(payrollId:number):Promise<{buffer:Buffer;filename:string}>{const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT d.original_path path,p.year,p.month,p.payroll_type payrollType FROM payroll_documents d JOIN payrolls p ON p.id=d.payroll_id WHERE d.payroll_id=? LIMIT 1`,[payrollId]);const row=rows[0];if(!row)throw notFound('Documento não encontrado.');return{buffer:await this.storage.read(String(row.path)),filename:`holerite-${row.year}-${String(row.month).padStart(2,'0')}-tipo-${row.payrollType}.pdf`};}
  async employeeDownload(payrollId:number,employeeId:number,meta:RequestMeta):Promise<{buffer:Buffer;filename:string}>{const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT d.signed_path path,p.year,p.month,p.payroll_type payrollType FROM payroll_documents d JOIN payrolls p ON p.id=d.payroll_id WHERE d.payroll_id=? AND p.employee_id=? AND p.status='SIGNED' LIMIT 1`,[payrollId,employeeId]);const row=rows[0];if(!row||!row.path)throw badRequest('O download é liberado somente após a assinatura.');await this.pool.execute(`INSERT INTO document_access_logs (payroll_id,actor_type,actor_id,action,ip_address,user_agent,created_at) VALUES (?,'EMPLOYEE',?,'DOWNLOAD',?,?,UTC_TIMESTAMP())`,[payrollId,employeeId,meta.ipAddress,meta.userAgent]);return{buffer:await this.storage.read(String(row.path)),filename:`holerite-assinado-${row.year}-${String(row.month).padStart(2,'0')}.pdf`};}
}
