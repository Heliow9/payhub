import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, type PayHubServices } from './app.js';
import type { Env } from './config/env.js';
import { notFound } from './core/errors.js';
import { sha256 } from './core/security.js';
import type { Principal } from './core/types.js';

const env:Env={
  NODE_ENV:'test',PORT:3081,APP_ORIGIN:'http://localhost:5173',COOKIE_SECURE:false,SESSION_TTL_HOURS:12,EMPLOYEE_SESSION_TTL_HOURS:168,LOGIN_RATE_LIMIT:100,
  DB_HOST:'localhost',DB_PORT:3306,DB_NAME:'payhub_test',DB_USER:'test',DB_PASSWORD:'',DOCUMENT_STORAGE_PATH:'/tmp/payhub-test',SIGNATURE_SEAL_SECRET:'0123456789abcdef0123456789abcdef',SIGNATURE_LINK_DEFAULT_TTL_MINUTES:1440,TSA_URL:'',TSA_BEARER_TOKEN:'',WORKER_POLL_SECONDS:20,CONNECTOR_OFFLINE_SECONDS:90,VAPID_SUBJECT:'',VAPID_PUBLIC_KEY:'',VAPID_PRIVATE_KEY:'',REVERSE_GEOCODING_ENABLED:false,REVERSE_GEOCODING_URL:'https://nominatim.openstreetmap.org/reverse',
};

const master:Principal={kind:'USER',id:1,companyId:1,companyName:'RealEnergy',name:'Master RealEnergy',email:'admin@realenergy.com.br',role:'MASTER',status:'ACTIVE'};
const employeeB:Principal={kind:'EMPLOYEE',id:220,identityId:10,companyId:2,companyName:'Empresa B',name:'Helio Teste',cpf:'12345678909',status:'ACTIVE',accessMode:'FULL'};

function fixture(){
  const csrfAdmin='csrf-admin-realenergy';
  const csrfEmployee='csrf-employee-company-b';
  const auth={
    authenticate:async(token?:string)=>{
      if(token==='admin-token')return{principal:master,tokenHash:'hash-admin',csrfHash:sha256(csrfAdmin)};
      if(token==='employee-b-token')return{principal:employeeB,tokenHash:'hash-employee-b',csrfHash:sha256(csrfEmployee)};
      return null;
    },
    adminLogin:async()=>({principal:master,token:'admin-token',csrfToken:csrfAdmin,expiresAt:new Date(Date.now()+3600_000)}),
    employeeLogin:async()=>({requiresCompanySelection:true as const,selectionToken:'selection-token-with-more-than-twenty-characters',companies:[
      {employeeId:110,companyId:1,companyName:'RealEnergy',name:'Helio Teste',status:'TERMINATED' as const,accessMode:'HISTORICAL' as const},
      {employeeId:220,companyId:2,companyName:'Empresa B',name:'Helio Teste',status:'ACTIVE' as const,accessMode:'FULL' as const},
    ]}),
    selectEmployeeCompany:async()=>({principal:employeeB,token:'employee-b-token',csrfToken:csrfEmployee,expiresAt:new Date(Date.now()+3600_000),client:'WEB' as const}),
    refreshCsrf:async(_hash:string|undefined,principal:Principal)=>principal.kind==='USER'?csrfAdmin:csrfEmployee,
    logout:async()=>undefined,
    listEmployeeCompanies:async()=>[],
    switchEmployeeCompany:async()=>({principal:employeeB,token:'employee-b-token',csrfToken:csrfEmployee,expiresAt:new Date(Date.now()+3600_000)}),
    firstAccess:async()=>({requiresCompanySelection:true as const,selectionToken:'selection-token-with-more-than-twenty-characters',companies:[]}),
  };
  const employees={
    detail:async(context:{companyId:number},id:number)=>{
      if(context.companyId!==1||id===200)throw notFound();
      return{id,name:'Funcionário A'};
    },
  };
  const services={auth,employees,runs:{},audit:{},connector:{},groups:{},payrolls:{},settings:{},signatures:{},storage:{},notifications:{},provisioning:{}} as unknown as PayHubServices;
  const pool={execute:async()=>[[]],query:async()=>[[]]} as never;
  return{app:createApp(pool,env,services),csrfAdmin};
}

describe('PayHub active HTTP stack - multiempresa',()=>{
  it('serve health na aplicação ativa',async()=>{
    const{app}=fixture();
    const response=await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ok:true,service:'PayHub API'});
  });

  it('mantém login direto do MASTER da RealEnergy',async()=>{
    const{app}=fixture();
    const login=await request(app).post('/api/auth/login').send({identifier:'admin@realenergy.com.br',password:'secret'});
    expect(login.status).toBe(200);
    expect(login.body.principal).toMatchObject({kind:'USER',companyId:1,companyName:'RealEnergy',role:'MASTER'});
    expect(login.headers['set-cookie']?.join(';')).toContain('payhub_session=admin-token');
  });

  it('não expõe recurso da empresa B em sessão A',async()=>{
    const{app}=fixture();
    const agent=request.agent(app);
    const login=await agent.post('/api/auth/login').send({identifier:'admin@realenergy.com.br',password:'secret'});
    expect(login.status).toBe(200);
    const response=await agent.get('/api/employees/200');
    expect(response.status).toBe(404);
    expect(response.body.code??'').not.toBe('INTERNAL_ERROR');
  });

  it('seleciona empresa após CPF com dois vínculos sem criar sessão intermediária',async()=>{
    const{app}=fixture();
    const login=await request(app).post('/api/auth/login').send({identifier:'123.456.789-09',password:'123456'});
    expect(login.status).toBe(200);
    expect(login.body.requiresCompanySelection).toBe(true);
    expect(login.headers['set-cookie']).toBeUndefined();
    const selected=await request(app).post('/api/auth/select-company').send({selectionToken:login.body.selectionToken,companyId:2});
    expect(selected.status).toBe(200);
    expect(selected.body.principal).toMatchObject({kind:'EMPLOYEE',companyId:2,identityId:10,accessMode:'FULL'});
    expect(selected.headers['set-cookie']?.join(';')).toContain('payhub_session=employee-b-token');
  });
});
