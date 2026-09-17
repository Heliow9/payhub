import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { loadDotEnv } from '../config/load-dotenv.js';
import { loadEnv } from '../config/env.js';
import { createMySqlPool } from './mysql.js';
import { hashSecret } from '../core/security.js';

loadDotEnv();const env=loadEnv();const pool=createMySqlPool(env);const rl=readline.createInterface({input,output});
try{const [countRows]=await pool.query<any[]>(`SELECT COUNT(*) count FROM users WHERE role='MASTER'`);if(Number(countRows[0]?.count??0)>0){console.log('Já existe um MASTER.');process.exitCode=0;}else{const name=(await rl.question('Nome do Master: ')).trim();const email=(await rl.question('E-mail do Master: ')).trim().toLowerCase();const password=(await rl.question('Senha inicial (mín. 10 caracteres): '));if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<10)throw new Error('Dados inválidos.');const hash=await hashSecret(password);await pool.execute(`INSERT INTO users (name,email,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,'MASTER','ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP())`,[name,email,hash]);console.log('Master criado com sucesso.');}}finally{rl.close();await pool.end();}
