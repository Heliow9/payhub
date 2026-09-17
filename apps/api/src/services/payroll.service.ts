import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { badRequest, notFound } from '../core/errors.js';
import { maskCpf } from '../core/security.js';
import { parseJson } from '../core/json.js';
import type { RequestMeta } from '../core/types.js';
import { AuditService } from './audit.service.js';
import { buildPayrollPdf } from './pdf.service.js';
import { StorageService } from './storage.service.js';
import { normalizePayrollBatches, type SourceBatch } from './normalizer.service.js';
import { NotificationService } from './notification.service.js';
import { withSignatureEvidenceDisclosure } from './signature-disclosure.js';


function sageSnapshotValue(raw:unknown,aliases:string[]):string|null{
  const snapshot=parseJson<Record<string,unknown>>(raw,{});const entries=new Map(Object.entries(snapshot).map(([k,v])=>[k.toLowerCase(),v]));
  for(const alias of aliases){const value=entries.get(alias.toLowerCase());if(value!==undefined&&value!==null&&String(value).trim()!=='')return String(value).trim();}
  return null;
}
const cboAliases=['cbo','cd_cbo','nr_cbo','codigo_cbo','cbo_funcao','cd_cbo_funcao'];
const legacyPayrollFooter='Documento gerado pelo PayHub a partir dos dados de folha recebidos do Sage.';

function exportFileSafe(value:string):string{return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,90)||'HOLERITE';}
export type PayrollExportEntry={payrollId:number;employeeName:string;competence:string;typeLabel:string;status:string;documentKind:'ASSINADO'|'ORIGINAL';sha256:string;filename:string;buffer:Buffer};

export class PayrollService{
  constructor(private pool:Pool,private storage:StorageService,private audit:AuditService,private notifications:NotificationService){}

  async normalizeCompletedJob(jobId:number):Promise<{created:number;unchanged:number;skipped:number}>{
    const [jobRows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,payroll_run_id payrollRunId,scope_json scopeJson,status,normalized_at normalizedAt FROM import_jobs WHERE id=? LIMIT 1`,[jobId]);
    const job=jobRows[0];if(!job||job.status!=='COMPLETED'||job.normalizedAt)return{created:0,unchanged:0,skipped:0};
    const scope=parseJson<{employeeCodes?:string[]}>(job.scopeJson,{});const target=scope.employeeCodes??[];
    const [batchRows]=await this.pool.execute<RowDataPacket[]>(`SELECT source_table sourceTable,payload_json payload FROM connector_raw_batches WHERE job_id=? ORDER BY source_table,batch_number`,[jobId]);
    const batches:SourceBatch[]=batchRows.map((b)=>({sourceTable:String(b.sourceTable),rows:parseJson<Array<Record<string,unknown>>>(b.payload,[])}));
    const normalized=normalizePayrollBatches(batches,target);let created=0,unchanged=0,skipped=0;
    for(const p of normalized){
      const [employeeRows]=await this.pool.execute<RowDataPacket[]>(`SELECT id,name,cpf,sage_employee_code sageCode,job_title jobTitle,DATE_FORMAT(admission_date,'%Y-%m-%d') admissionDate,sage_snapshot_json sageSnapshotJson FROM employees WHERE company_code='1' AND sage_employee_code=? AND status='ACTIVE' LIMIT 1`,[p.sageEmployeeCode]);
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
        const base=(p.rawReference?.base??{}) as Record<string,unknown>;const salaryBase=p.items.find((i)=>i.code==='1'&&i.nature==='EARNING')?.amount??null;const fgtsBase=base.vl_base_fgts==null?null:Number(base.vl_base_fgts);const pdf=buildPayrollPdf({employeeName:String(employee.name),cpfMasked:maskCpf(String(employee.cpf)),sageCode:String(employee.sageCode),competence:`${String(p.month).padStart(2,'0')}/${p.year}`,typeLabel:p.payrollTypeLabel,jobTitle:employee.jobTitle?String(employee.jobTitle):null,admissionDate:employee.admissionDate?String(employee.admissionDate):null,cbo:sageSnapshotValue(employee.sageSnapshotJson,cboAliases),gross:p.gross,deductions:p.deductions,net:p.net,salaryBase,inssBase:base.vl_base_inss==null?null:Number(base.vl_base_inss),fgtsBase,fgtsMonth:fgtsBase==null?null:Math.round(fgtsBase*8)/100,irrfBase:base.vl_base_irrf==null?null:Number(base.vl_base_irrf),irrfBracket:0,items:p.items.map((i)=>({code:i.code,description:i.description,reference:i.reference,amount:i.amount,nature:i.nature}))});
        const relative=`payrolls/${employee.id}/${p.year}/${String(p.month).padStart(2,'0')}/${p.payrollType}/v${version}/original.pdf`;const stored=await this.storage.write(relative,pdf);
        await this.pool.execute(`INSERT INTO payroll_documents (payroll_id,original_path,original_sha256,created_at,updated_at) VALUES (?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[payrollId,stored.path,stored.sha256]);
        await this.pool.execute(`UPDATE payrolls SET status='READY',updated_at=UTC_TIMESTAMP() WHERE id=?`,[payrollId]);created++;
      }catch(error){await this.pool.execute(`UPDATE payrolls SET status='ERROR',updated_at=UTC_TIMESTAMP() WHERE id=?`,[payrollId]);throw error;}
    }
    await this.pool.execute(`UPDATE import_jobs SET normalized_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?`,[jobId]);
    if(job.payrollRunId){const status=skipped>0?'PARTIAL':'COMPLETED';await this.pool.execute(`UPDATE payroll_runs SET status=?,success_count=?,failure_count=?,message=?,finished_at=UTC_TIMESTAMP() WHERE id=?`,[status,created+unchanged,skipped,`${created} novo(s), ${unchanged} sem alteração, ${skipped} ignorado(s).`,job.payrollRunId]);}
    await this.notifications.notifyAdmins({category:'IMPORT_COMPLETED',title:'Importação de holerites concluída',body:`${created} novo(s), ${unchanged} sem alteração e ${skipped} ignorado(s).`,url:'/#/payrolls',dedupKey:`import-completed:${jobId}`});
    return{created,unchanged,skipped};
  }

  async listAdmin(filters:{employeeId?:number;groupId?:number;year?:number;month?:number;status?:string;type?:number}={}):Promise<Record<string,unknown>[]>{
    const where=['p.is_current=1'];const params:Array<number|string>=[];if(filters.employeeId){where.push('p.employee_id=?');params.push(filters.employeeId);}if(filters.groupId){where.push('e.group_id=?');params.push(filters.groupId);}if(filters.year){where.push('p.year=?');params.push(filters.year);}if(filters.month){where.push('p.month=?');params.push(filters.month);}if(filters.status){where.push('p.status=?');params.push(filters.status);}if(filters.type){where.push('p.payroll_type=?');params.push(filters.type);}
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.id,p.employee_id employeeId,e.name employeeName,e.cpf,e.group_id groupId,g.name groupName,p.year,p.month,p.payroll_type payrollType,p.payroll_type_label payrollTypeLabel,p.version,p.status,p.gross_amount grossAmount,p.deduction_amount deductionAmount,p.net_amount netAmount,p.released_at releasedAt,p.signed_at signedAt,p.created_at createdAt,d.original_sha256 originalSha256,d.signed_sha256 signedSha256 FROM payrolls p JOIN employees e ON e.id=p.employee_id JOIN employee_groups g ON g.id=e.group_id LEFT JOIN payroll_documents d ON d.payroll_id=p.id WHERE ${where.join(' AND ')} ORDER BY p.year DESC,p.month DESC,e.name ASC,p.payroll_type ASC LIMIT 1000`,params);return rows;
  }

  async listEmployee(employeeId:number):Promise<Record<string,unknown>[]>{const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.id,p.year,p.month,p.payroll_type payrollType,p.payroll_type_label payrollTypeLabel,p.status,p.gross_amount grossAmount,p.deduction_amount deductionAmount,p.net_amount netAmount,p.released_at releasedAt,p.signed_at signedAt FROM payrolls p WHERE p.employee_id=? AND p.is_current=1 AND p.status IN ('SIGNATURE_REQUESTED','VIEWED','SIGNED') ORDER BY p.year DESC,p.month DESC,p.payroll_type`,[employeeId]);return rows;}

  async detail(payrollId:number,employeeId?:number):Promise<Record<string,unknown>>{
    const params:number[]=[payrollId];let employeeClause='';if(employeeId){employeeClause=' AND p.employee_id=? AND p.status IN (\'SIGNATURE_REQUESTED\',\'VIEWED\',\'SIGNED\')';params.push(employeeId);}
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.*,e.name employeeName,e.cpf,e.sage_employee_code sageCode,e.job_title jobTitle,DATE_FORMAT(e.admission_date,'%Y-%m-%d') admissionDate,e.sage_snapshot_json sageSnapshotJson,g.name groupName,d.original_sha256 originalSha256,d.signed_sha256 signedSha256,d.receipt_sha256 receiptSha256,sr.id signatureRequestId,sr.status signatureStatus,sr.acceptance_text acceptanceText,aset.signature_mode signatureMode FROM payrolls p JOIN employees e ON e.id=p.employee_id JOIN employee_groups g ON g.id=e.group_id LEFT JOIN payroll_documents d ON d.payroll_id=p.id LEFT JOIN signature_requests sr ON sr.payroll_id=p.id LEFT JOIN app_settings aset ON aset.id=1 WHERE p.id=? ${employeeClause} LIMIT 1`,params);const row=rows[0];if(!row)throw notFound('Holerite não encontrado.');const cbo=sageSnapshotValue(row.sageSnapshotJson,cboAliases);delete row.sageSnapshotJson;
    if(row.acceptanceText)row.acceptanceText=withSignatureEvidenceDisclosure(String(row.acceptanceText));
    const [items]=await this.pool.execute<RowDataPacket[]>(`SELECT event_code eventCode,description,reference_value referenceValue,amount,nature,sort_order sortOrder FROM payroll_items WHERE payroll_id=? ORDER BY sort_order,id`,[payrollId]);return{...row,cbo,summary:parseJson(row.summary_json,{}),summary_json:undefined,rawReference:parseJson(row.raw_reference_json,{}),raw_reference_json:undefined,items};
  }

  async release(actorId:number,payrollId:number,acceptanceText:string,meta:RequestMeta):Promise<number>{
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT employee_id employeeId,status FROM payrolls WHERE id=? AND is_current=1 LIMIT 1`,[payrollId]);const row=rows[0];if(!row)throw notFound('Holerite não encontrado.');if(!['READY','SIGNATURE_REQUESTED','VIEWED'].includes(String(row.status)))throw badRequest('Este holerite não pode ser liberado neste status.');
    acceptanceText=withSignatureEvidenceDisclosure(acceptanceText);const {sha256}=await import('../core/security.js');const hash=sha256(acceptanceText);
    await this.pool.execute(`INSERT INTO signature_requests (payroll_id,employee_id,requested_by_user_id,status,acceptance_text,acceptance_text_hash,requested_at) VALUES (?,?,?,'PENDING',?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE requested_by_user_id=VALUES(requested_by_user_id),status=IF(status='SIGNED',status,'PENDING'),acceptance_text=VALUES(acceptance_text),acceptance_text_hash=VALUES(acceptance_text_hash),requested_at=IF(status='SIGNED',requested_at,UTC_TIMESTAMP())`,[payrollId,row.employeeId,actorId,acceptanceText,hash]);
    await this.pool.execute(`UPDATE payrolls SET status=IF(status='SIGNED',status,'SIGNATURE_REQUESTED'),released_at=COALESCE(released_at,UTC_TIMESTAMP()),updated_at=UTC_TIMESTAMP() WHERE id=?`,[payrollId]);
    const [requestRows]=await this.pool.execute<RowDataPacket[]>(`SELECT id FROM signature_requests WHERE payroll_id=? LIMIT 1`,[payrollId]);const requestId=Number(requestRows[0]!.id);
    await this.audit.record({actorUserId:actorId,action:'PAYROLL_SIGNATURE_REQUESTED',targetType:'PAYROLL',targetId:payrollId,meta,metadata:{signatureRequestId:requestId}});
    const [notifyRows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.year,p.month,p.payroll_type_label typeLabel,e.name FROM payrolls p JOIN employees e ON e.id=p.employee_id WHERE p.id=? LIMIT 1`,[payrollId]);const n=notifyRows[0];
    await this.notifications.notifyEmployee(Number(row.employeeId),{category:'PAYROLL_AVAILABLE',title:'Novo holerite para assinatura',body:n?`${String(n.typeLabel)} de ${String(n.month).padStart(2,'0')}/${n.year} está disponível.`:'Seu holerite está disponível para assinatura.',url:'/#/employee',dedupKey:`payroll-release:${payrollId}`});
    return requestId;
  }

  async markViewed(payrollId:number,employeeId:number,meta:RequestMeta):Promise<void>{await this.pool.execute(`UPDATE payrolls SET status=IF(status='SIGNATURE_REQUESTED','VIEWED',status),updated_at=UTC_TIMESTAMP() WHERE id=? AND employee_id=?`,[payrollId,employeeId]);await this.pool.execute(`INSERT INTO document_access_logs (payroll_id,actor_type,actor_id,action,ip_address,user_agent,created_at) VALUES (?,'EMPLOYEE',?,'VIEW_FULL',?,?,UTC_TIMESTAMP())`,[payrollId,employeeId,meta.ipAddress,meta.userAgent]);}

  private async readOriginalWithoutLegacyFooter(payrollId:number,path:string):Promise<{buffer:Buffer;sha256:string}>{const buffer=await this.storage.read(path);const marker=Buffer.from(legacyPayrollFooter,'latin1');let index=buffer.indexOf(marker);if(index<0){const {sha256}=await import('../core/security.js');return{buffer,sha256:sha256(buffer)};}const cleaned=Buffer.from(buffer);while(index>=0){cleaned.fill(0x20,index,index+marker.length);index=cleaned.indexOf(marker,index+marker.length);}const stored=await this.storage.write(path,cleaned);await this.pool.execute(`UPDATE payroll_documents SET original_sha256=?,updated_at=UTC_TIMESTAMP() WHERE payroll_id=?`,[stored.sha256,payrollId]);return{buffer:cleaned,sha256:stored.sha256};}

  async originalDocument(payrollId:number):Promise<{buffer:Buffer;filename:string}>{const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT d.original_path path,p.year,p.month,p.payroll_type payrollType FROM payroll_documents d JOIN payrolls p ON p.id=d.payroll_id WHERE d.payroll_id=? LIMIT 1`,[payrollId]);const row=rows[0];if(!row)throw notFound('Documento não encontrado.');const doc=await this.readOriginalWithoutLegacyFooter(payrollId,String(row.path));return{buffer:doc.buffer,filename:`holerite-${row.year}-${String(row.month).padStart(2,'0')}-tipo-${row.payrollType}.pdf`};}

  async adminDocument(payrollId:number):Promise<{buffer:Buffer;filename:string;kind:'ASSINADO'|'ORIGINAL'}>{
    const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.status,p.year,p.month,p.payroll_type payrollType,e.name employeeName,d.original_path originalPath,d.original_sha256 originalSha,d.signed_path signedPath,d.signed_sha256 signedSha FROM payrolls p JOIN employees e ON e.id=p.employee_id JOIN payroll_documents d ON d.payroll_id=p.id WHERE p.id=? LIMIT 1`,[payrollId]);
    const row=rows[0];if(!row)throw notFound('Documento não encontrado.');const signed=Boolean(row.signedPath);const path=String(signed?row.signedPath:row.originalPath);const kind=signed?'ASSINADO':'ORIGINAL';const name=exportFileSafe(String(row.employeeName));const buffer=signed?await this.storage.read(path):(await this.readOriginalWithoutLegacyFooter(payrollId,path)).buffer;return{buffer,filename:`${name}_${row.year}-${String(row.month).padStart(2,'0')}_TIPO-${row.payrollType}_${kind}.pdf`,kind};
  }

  async exportDocuments(payrollIds:number[],actorId:number,meta:RequestMeta):Promise<PayrollExportEntry[]>{
    const ids=[...new Set(payrollIds.filter((id)=>Number.isInteger(id)&&id>0))];if(ids.length===0)throw badRequest('Selecione ao menos um holerite.');if(ids.length>200)throw badRequest('A exportação permite até 200 holerites por vez.');
    const placeholders=ids.map(()=>'?').join(',');const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT p.id,p.status,p.year,p.month,p.payroll_type payrollType,p.payroll_type_label typeLabel,e.name employeeName,d.original_path originalPath,d.original_sha256 originalSha,d.signed_path signedPath,d.signed_sha256 signedSha FROM payrolls p JOIN employees e ON e.id=p.employee_id JOIN payroll_documents d ON d.payroll_id=p.id WHERE p.id IN (${placeholders}) AND p.is_current=1 ORDER BY e.name,p.year,p.month,p.payroll_type`,ids);
    if(rows.length!==ids.length)throw badRequest('Um ou mais holerites selecionados não estão disponíveis para exportação.');
    const entries:PayrollExportEntry[]=[];for(const row of rows){const signed=Boolean(row.signedPath);const kind=signed?'ASSINADO':'ORIGINAL';const path=String(signed?row.signedPath:row.originalPath);let buffer:Buffer;let sha:string;if(signed){buffer=await this.storage.read(path);sha=String(row.signedSha);}else{const original=await this.readOriginalWithoutLegacyFooter(Number(row.id),path);buffer=original.buffer;sha=original.sha256;}const competence=`${String(row.month).padStart(2,'0')}/${row.year}`;const filename=`${exportFileSafe(String(row.employeeName))}_${row.year}-${String(row.month).padStart(2,'0')}_${exportFileSafe(String(row.typeLabel))}_${kind}.pdf`;entries.push({payrollId:Number(row.id),employeeName:String(row.employeeName),competence,typeLabel:String(row.typeLabel),status:String(row.status),documentKind:kind,sha256:sha,filename,buffer});await this.pool.execute(`INSERT INTO document_access_logs (payroll_id,actor_type,actor_id,action,ip_address,user_agent,created_at) VALUES (?,'USER',?,'DOWNLOAD',?,?,UTC_TIMESTAMP())`,[Number(row.id),actorId,meta.ipAddress,meta.userAgent]);}
    return entries;
  }

  async employeeDownload(payrollId:number,employeeId:number,meta:RequestMeta):Promise<{buffer:Buffer;filename:string}>{const [rows]=await this.pool.execute<RowDataPacket[]>(`SELECT d.signed_path path,p.year,p.month,p.payroll_type payrollType FROM payroll_documents d JOIN payrolls p ON p.id=d.payroll_id WHERE d.payroll_id=? AND p.employee_id=? AND p.status='SIGNED' LIMIT 1`,[payrollId,employeeId]);const row=rows[0];if(!row||!row.path)throw badRequest('O download é liberado somente após a assinatura.');await this.pool.execute(`INSERT INTO document_access_logs (payroll_id,actor_type,actor_id,action,ip_address,user_agent,created_at) VALUES (?,'EMPLOYEE',?,'DOWNLOAD',?,?,UTC_TIMESTAMP())`,[payrollId,employeeId,meta.ipAddress,meta.userAgent]);return{buffer:await this.storage.read(String(row.path)),filename:`holerite-assinado-${row.year}-${String(row.month).padStart(2,'0')}.pdf`};}
}
