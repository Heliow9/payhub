import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from '../db/mysql.js';

interface CheckRow extends RowDataPacket { name:string; value:number|string; expected:number|string }

export function documentPerformanceVerificationSql():string{return `
SELECT 'payrolls_without_document_number' name, COUNT(*) value, 0 expected
  FROM payrolls WHERE document_number IS NULL OR document_number=''
UNION ALL
SELECT 'duplicate_document_numbers', COUNT(*), 0 FROM (
  SELECT document_number FROM payrolls GROUP BY document_number HAVING COUNT(*)>1
) duplicates
UNION ALL
SELECT 'payrolls_without_render_hash', COUNT(*), 0
  FROM payrolls WHERE render_hash IS NULL OR render_hash=''
UNION ALL
SELECT 'signed_payrolls_without_evidence', COUNT(*), 0
  FROM payrolls p LEFT JOIN signature_evidence se ON se.payroll_id=p.id
 WHERE p.status='SIGNED' AND se.id IS NULL
UNION ALL
SELECT 'archived_raw_without_file_reference', COUNT(*), 0
  FROM connector_raw_batches
 WHERE payload_json IS NULL AND (archived_path IS NULL OR archived_path='' OR archived_sha256 IS NULL OR archived_sha256='')
UNION ALL
SELECT 'raw_with_archive_and_payload_duplicate', COUNT(*), 0
  FROM connector_raw_batches
 WHERE payload_json IS NOT NULL AND archived_path IS NOT NULL
UNION ALL
SELECT 'verification_logs_orphaned', COUNT(*), 0
  FROM document_verification_logs v LEFT JOIN payrolls p ON p.id=v.payroll_id
 WHERE p.id IS NULL`}

export async function verifyDocumentPerformance(pool:Pick<Pool,'query'>){
  const [rows]=await pool.query<CheckRow[]>(documentPerformanceVerificationSql());
  return rows.map((row)=>{const value=Number(row.value);const expected=Number(row.expected);return{name:String(row.name),value,expected,ok:value===expected};});
}

async function main():Promise<void>{
  loadDotEnv();const pool=createMySqlPool(loadEnv());
  try{
    const checks=await verifyDocumentPerformance(pool);let failed=false;
    for(const check of checks){const marker=check.ok?'OK':'FALHA';console.log(`${marker.padEnd(5)} ${check.name}: ${check.value} (esperado ${check.expected})`);if(!check.ok)failed=true;}
    if(failed)process.exitCode=1;
  }finally{await pool.end();}
}

const invokedPath=process.argv[1]?path.resolve(process.argv[1]).toLowerCase():'';
if(invokedPath===fileURLToPath(import.meta.url).toLowerCase())await main();
