import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RowDataPacket } from 'mysql2/promise';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from '../db/mysql.js';
import { createServices } from '../app.js';

function argNumber(name:string,fallback:number):number{
  const raw=process.argv.find((arg)=>arg.startsWith(`--${name}=`))?.split('=')[1];
  const value=Number(raw);return Number.isFinite(value)&&value>0?Math.trunc(value):fallback;
}
function mb(bytes:number):string{return(bytes/1024/1024).toFixed(2);}

async function main():Promise<void>{
  loadDotEnv();const env=loadEnv();const pool=createMySqlPool(env);const services=createServices(pool,env);const limit=Math.min(argNumber('limit',100),1000);
  try{
    const [jobs]=await pool.query<RowDataPacket[]>(`SELECT DISTINCT b.job_id jobId,b.company_id companyId FROM connector_raw_batches b JOIN import_jobs j ON j.id=b.job_id AND j.company_id=b.company_id WHERE b.payload_json IS NOT NULL AND j.job_type='PAYROLL_IMPORT' AND j.status='COMPLETED' AND j.normalized_at IS NOT NULL AND j.normalization_state='COMPLETED' ORDER BY b.job_id LIMIT ${limit}`);
    let archived=0;let before=0;let after=0;
    for(const job of jobs){const result=await services.payrolls.archiveCompletedJobRaw(Number(job.jobId),Number(job.companyId));archived+=result.archived;before+=result.bytesBefore;after+=result.bytesAfter;console.log(`job ${job.jobId}: ${result.archived} batch(es), ${mb(result.bytesBefore)} MB -> ${mb(result.bytesAfter)} MB`);}
    console.log(`Concluído: ${jobs.length} job(s), ${archived} batch(es), ${mb(before)} MB -> ${mb(after)} MB; redução no payload bruto: ${mb(Math.max(0,before-after))} MB.`);
  }finally{await pool.end();}
}

const invokedPath=process.argv[1]?path.resolve(process.argv[1]).toLowerCase():'';
if(invokedPath===fileURLToPath(import.meta.url).toLowerCase())await main();
