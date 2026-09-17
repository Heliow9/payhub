import { loadDotEnv } from './config/load-dotenv.js';
import { loadEnv } from './config/env.js';
import { createMySqlPool } from './db/mysql.js';
import { createApp } from './app.js';

loadDotEnv();const env=loadEnv();const pool=createMySqlPool(env);const app=createApp(pool,env);const server=app.listen(env.PORT,()=>console.log(`PayHub API ouvindo na porta ${env.PORT}`));
async function shutdown(signal:string){console.log(`Recebido ${signal}; encerrando PayHub API...`);server.close(async()=>{await pool.end();process.exit(0);});}
process.on('SIGTERM',()=>void shutdown('SIGTERM'));process.on('SIGINT',()=>void shutdown('SIGINT'));
