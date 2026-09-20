import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from './mysql.js';
import { CompanyProvisioningService } from '../services/company-provisioning.service.js';

loadDotEnv();const env=loadEnv();const pool=createMySqlPool(env);const rl=readline.createInterface({input,output});
try{const [countRows]=await pool.query<any[]>(`SELECT COUNT(*) count FROM companies`);if(Number(countRows[0]?.count??0)>0){console.log('Já existe uma empresa provisionada; o bootstrap não cria outro MASTER.');process.exitCode=0;}else{const legalName=(await rl.question('Razão social: ')).trim();const displayName=(await rl.question('Nome da empresa: ')).trim();const slug=(await rl.question('Slug da empresa: ')).trim();const sageCompanyCode=(await rl.question('Código da empresa no Sage: ')).trim();const name=(await rl.question('Nome do Master: ')).trim();const email=(await rl.question('E-mail do Master: ')).trim().toLowerCase();const password=(await rl.question('Senha inicial (mín. 10 caracteres): '));await new CompanyProvisioningService(pool).provision({legalName,displayName,slug,sageCompanyCode,master:{name,email,password}});console.log('Empresa e MASTER criados com sucesso.');}}finally{rl.close();await pool.end();}
