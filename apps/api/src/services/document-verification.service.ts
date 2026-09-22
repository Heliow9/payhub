import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Env } from '../config/env.js';
import type { RequestMeta } from '../core/types.js';
import { notFound, badRequest } from '../core/errors.js';
import { hmacSha256, sha256 } from '../core/security.js';
import { parseJson } from '../core/json.js';
import { StorageService } from './storage.service.js';
import { isDocumentNumber, normalizeDocumentNumber } from './document-number.js';

function maskCpf(value:string):string{
  const cpf=String(value??'').replace(/\D/g,'');
  return cpf.length===11?`***.***.${cpf.slice(6,9)}-${cpf.slice(9)}`:'***.***.***-**';
}

function maskName(value:string):string{
  const parts=String(value??'').trim().split(/\s+/).filter(Boolean);
  if(!parts.length)return'Não informado';
  return parts.map((part,index)=>{
    if(index===0||index===parts.length-1)return part;
    return `${part.slice(0,1)}***`;
  }).join(' ');
}

function tsaState(raw:unknown):{configured:boolean;present:boolean;label:string}{
  if(raw==null||String(raw).trim()==='')return{configured:false,present:false,label:'Sem carimbo de tempo externo registrado'};
  const text=String(raw);
  if(text.startsWith('{')){
    try{
      const parsed=JSON.parse(text);
      if(parsed?.error)return{configured:true,present:false,label:'TSA configurada, porém o registro externo apresentou falha'};
    }catch{}
  }
  return{configured:true,present:true,label:'Carimbo de tempo RFC 3161 registrado'};
}

export class DocumentVerificationService{
  constructor(private pool:Pool,private storage:StorageService,private env:Env){}

  private async log(payrollId:number,documentNumber:string,type:'LOOKUP'|'FILE_HASH',resultCode:string,meta:RequestMeta,fileHash?:string|null):Promise<void>{
    await this.pool.execute(
      `INSERT INTO document_verification_logs (payroll_id,document_number,verification_type,supplied_file_sha256,result_code,ip_address,user_agent,created_at)
       VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP())`,
      [payrollId,documentNumber,type,fileHash??null,resultCode,meta.ipAddress,meta.userAgent],
    );
  }

  private async record(documentNumber:string):Promise<RowDataPacket>{
    const normalized=normalizeDocumentNumber(documentNumber);
    if(!isDocumentNumber(normalized))throw badRequest('Código de verificação inválido.','DOCUMENT_NUMBER_INVALID');
    const [rows]=await this.pool.execute<RowDataPacket[]>(`
      SELECT
        p.id payrollId,p.document_number documentNumber,p.company_id companyId,p.year,p.month,
        p.payroll_type_label payrollTypeLabel,p.version,p.is_current isCurrent,p.status,
        p.created_at createdAt,p.signed_at signedAt,
        e.name employeeName,e.cpf,
        c.display_name companyName,
        d.original_path originalPath,d.original_sha256 originalSha256,
        d.signed_path signedPath,d.signed_sha256 signedSha256,
        se.signature_request_id signatureRequestId,se.evidence_json evidenceJson,
        se.evidence_sha256 evidenceSha256,se.seal_hmac_sha256 sealHmacSha256,se.tsa_response tsaResponse
      FROM payrolls p
      JOIN employees e ON e.id=p.employee_id AND e.company_id=p.company_id
      JOIN companies c ON c.id=p.company_id
      LEFT JOIN payroll_documents d ON d.payroll_id=p.id
      LEFT JOIN signature_evidence se ON se.payroll_id=p.id
      WHERE p.document_number=?
      LIMIT 1`,
      [normalized],
    );
    const row=rows[0];
    if(!row)throw notFound('Documento não encontrado.');
    return row;
  }

  private async fileMatches(pathValue:unknown,expectedValue:unknown):Promise<boolean|null>{
    const path=String(pathValue??'');const expected=String(expectedValue??'');
    if(!path||!expected)return null;
    try{
      if(!(await this.storage.exists(path)))return false;
      return sha256(await this.storage.read(path))===expected;
    }catch{return false;}
  }

  private async chainIntegrity(signatureRequestId:unknown):Promise<boolean|null>{
    if(signatureRequestId==null)return null;
    const [events]=await this.pool.execute<RowDataPacket[]>(
      `SELECT event_json eventJson,previous_hash previousHash,event_hash eventHash
       FROM signature_events WHERE signature_request_id=? ORDER BY id`,
      [signatureRequestId],
    );
    if(!events.length)return false;
    let previous:string|null=null;
    for(const event of events){
      const storedPrevious=event.previousHash==null?null:String(event.previousHash);
      const eventJson=String(event.eventJson??'');
      const eventHash=String(event.eventHash??'');
      if(storedPrevious!==previous)return false;
      const expected=sha256(`${previous??''}|${eventJson}`);
      if(expected!==eventHash)return false;
      previous=eventHash;
    }
    return true;
  }

  async verify(documentNumber:string,meta:RequestMeta):Promise<Record<string,unknown>>{
    const row=await this.record(documentNumber);
    const originalFileMatch=await this.fileMatches(row.originalPath,row.originalSha256);
    const signedFileMatch=await this.fileMatches(row.signedPath,row.signedSha256);
    const evidenceJson=row.evidenceJson==null?'':String(row.evidenceJson);
    const evidenceHashMatch=evidenceJson&&row.evidenceSha256?sha256(evidenceJson)===String(row.evidenceSha256):null;
    const evidenceSealMatch=evidenceJson&&row.sealHmacSha256?hmacSha256(this.env.SIGNATURE_SEAL_SECRET,evidenceJson)===String(row.sealHmacSha256):null;
    const eventChainMatch=await this.chainIntegrity(row.signatureRequestId);
    const tsa=tsaState(row.tsaResponse);
    const signed=String(row.status)==='SIGNED'&&Boolean(row.signedSha256);
    const evidenceRecord=parseJson<Record<string,unknown>>(evidenceJson,{});
    const evidenceDocumentLinksMatch=evidenceJson?
      String(evidenceRecord.documentNumber??'')===String(row.documentNumber??'')
      && String(evidenceRecord.originalPdfSha256??'')===String(row.originalSha256??'')
      && (!signed||String(evidenceRecord.signedPdfSha256??'')===String(row.signedSha256??''))
      :null;
    const integrityOk=originalFileMatch!==false
      && (!signed||signedFileMatch===true)
      && (!signed||evidenceHashMatch===true)
      && (!signed||evidenceSealMatch===true)
      && (!signed||evidenceDocumentLinksMatch===true)
      && (!signed||eventChainMatch===true);
    const resultCode=!integrityOk?'INTEGRITY_ALERT':signed?'VERIFIED_SIGNED':'VERIFIED_UNSIGNED';
    await this.log(Number(row.payrollId),String(row.documentNumber),'LOOKUP',resultCode,meta);
    return{
      found:true,
      resultCode,
      technicalIntegrity:integrityOk,
      signed,
      historical:Number(row.isCurrent)!==1,
      document:{
        number:String(row.documentNumber),
        companyName:String(row.companyName),
        employeeName:maskName(String(row.employeeName)),
        cpfMasked:maskCpf(String(row.cpf)),
        competence:`${String(row.month).padStart(2,'0')}/${row.year}`,
        payrollTypeLabel:String(row.payrollTypeLabel),
        version:Number(row.version),
        status:String(row.status),
        createdAt:row.createdAt,
        signedAt:row.signedAt,
      },
      integrity:{
        originalPdf:{registered:Boolean(row.originalSha256),storageMatch:originalFileMatch,sha256Prefix:String(row.originalSha256??'').slice(0,16)},
        signedPdf:{registered:Boolean(row.signedSha256),storageMatch:signedFileMatch,sha256Prefix:String(row.signedSha256??'').slice(0,16)},
        evidence:{registered:Boolean(row.evidenceSha256),hashMatch:evidenceHashMatch,hmacSealMatch:evidenceSealMatch,documentLinksMatch:evidenceDocumentLinksMatch},
        signatureEventChain:eventChainMatch,
        tsa,
      },
      note:'Verificação técnica de integridade e correspondência com os registros do PayHub. Não substitui perícia documental quando exigida.'
    };
  }

  async compareFileHash(documentNumber:string,fileHash:string,meta:RequestMeta):Promise<Record<string,unknown>>{
    const normalizedHash=String(fileHash??'').trim().toLowerCase();
    if(!/^[a-f0-9]{64}$/.test(normalizedHash))throw badRequest('Hash SHA-256 inválido.','INVALID_SHA256');
    const row=await this.record(documentNumber);
    let match:'SIGNED'|'ORIGINAL'|'NONE'='NONE';
    if(row.signedSha256&&normalizedHash===String(row.signedSha256).toLowerCase())match='SIGNED';
    else if(row.originalSha256&&normalizedHash===String(row.originalSha256).toLowerCase())match='ORIGINAL';
    const resultCode=match==='NONE'?'FILE_HASH_MISMATCH':`FILE_HASH_MATCH_${match}`;
    await this.log(Number(row.payrollId),String(row.documentNumber),'FILE_HASH',resultCode,meta,normalizedHash);
    return{documentNumber:String(row.documentNumber),match,matches:match!=='NONE'};
  }
}
