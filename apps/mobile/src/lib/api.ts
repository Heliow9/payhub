import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

export type UserPrincipal={kind:'USER';id:number;companyId:number;companyName:string;name:string;email:string;role:'MASTER'|'ANALISTA';status:string};
export type EmployeePrincipal={kind:'EMPLOYEE';id:number;identityId:number;companyId:number;companyName:string;name:string;cpf:string;status:'ACTIVE'|'TERMINATED';accessMode:'FULL'|'HISTORICAL'};
export type Principal=UserPrincipal|EmployeePrincipal;
export type CompanyOption={employeeId:number;companyId:number;companyName:string;name:string;status:'ACTIVE'|'TERMINATED';accessMode:'FULL'|'HISTORICAL'};
export type MobileSession={principal:Principal;csrfToken:string;accessToken:string;expiresAt:string};
export type MobileCompanySelection={requiresCompanySelection:true;selectionToken:string;companies:CompanyOption[]};
export type MobileAuthOutcome=MobileSession|MobileCompanySelection;

const API_ROOT = (process.env.EXPO_PUBLIC_API_URL || 'https://paayhub.duckdns.org').replace(/\/$/, '');
const TOKEN_KEY='payhub_mobile_token';
const CSRF_KEY='payhub_mobile_csrf';
let accessToken='';
let csrfToken='';

export class ApiError extends Error { constructor(message:string, public status:number, public code?:string, public details?:unknown){super(message);} }
export async function restoreSessionSecrets(){ accessToken=(await SecureStore.getItemAsync(TOKEN_KEY))??''; csrfToken=(await SecureStore.getItemAsync(CSRF_KEY))??''; }
async function saveSession(token:string, csrf:string){ accessToken=token; csrfToken=csrf; await Promise.all([SecureStore.setItemAsync(TOKEN_KEY,token),SecureStore.setItemAsync(CSRF_KEY,csrf)]); }
export async function clearSession(){ accessToken=''; csrfToken=''; await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY),SecureStore.deleteItemAsync(CSRF_KEY)]); }
async function setCsrf(value:string){ csrfToken=value; if(value) await SecureStore.setItemAsync(CSRF_KEY,value); else await SecureStore.deleteItemAsync(CSRF_KEY); }

async function request<T>(path:string, options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers);
  if(options.body&&!headers.has('content-type')) headers.set('content-type','application/json');
  headers.set('accept','application/json');
  headers.set('x-payhub-client','mobile');
  if(accessToken) headers.set('authorization',`Bearer ${accessToken}`);
  const method=(options.method??'GET').toUpperCase();
  if(!['GET','HEAD'].includes(method)&&csrfToken) headers.set('x-csrf-token',csrfToken);
  const response=await fetch(`${API_ROOT}${path}`,{...options,headers});
  if(response.status===204)return undefined as T;
  const contentType=response.headers.get('content-type')??'';
  let payload:any={};
  if(contentType.includes('application/json')) payload=await response.json().catch(()=>({}));
  else payload=await response.text().catch(()=>(''));
  if(!response.ok) throw new ApiError(payload?.error??`Erro HTTP ${response.status}`,response.status,payload?.code,payload?.details);
  return payload as T;
}
const json=(value:unknown)=>JSON.stringify(value);
const isSelection=(value:MobileAuthOutcome):value is MobileCompanySelection=>'requiresCompanySelection' in value&&value.requiresCompanySelection===true;

function persistOutcome(result:MobileSession):Promise<MobileSession>;
function persistOutcome(result:MobileAuthOutcome):Promise<MobileAuthOutcome>;
async function persistOutcome(result:MobileAuthOutcome):Promise<MobileAuthOutcome>{
  if(isSelection(result)) return result;
  if(!result.accessToken) throw new ApiError('A API não retornou o token mobile.',500,'MOBILE_TOKEN_MISSING');
  await saveSession(result.accessToken,result.csrfToken);
  return result;
}

export const api={
  root:API_ROOT,
  async me(){const result=await request<{principal:Principal|null;csrfToken:string}>('/api/auth/me'); if(result.csrfToken) await setCsrf(result.csrfToken); return result;},
  async login(cpf:string,pin:string){return persistOutcome(await request<MobileAuthOutcome>('/api/auth/login',{method:'POST',body:json({identifier:cpf,password:pin,client:'MOBILE'})}));},
  async firstAccess(cpf:string,birthDate:string,pin:string){return persistOutcome(await request<MobileAuthOutcome>('/api/auth/employee-first-access',{method:'POST',body:json({cpf,birthDate,pin,client:'MOBILE'})}));},
  async selectCompany(selectionToken:string,companyId:number){return persistOutcome(await request<MobileSession>('/api/auth/select-company',{method:'POST',body:json({selectionToken,companyId})}));},
  async companyOptions(){return request<{companies:CompanyOption[]}>('/api/auth/companies');},
  async switchCompany(companyId:number){
    const result=await request<MobileSession>('/api/auth/switch-company',{method:'POST',body:json({companyId,client:'MOBILE'})});
    if(!result.accessToken) throw new ApiError('A API não retornou o novo token mobile.',500,'MOBILE_TOKEN_MISSING');
    // A sessão anterior já foi revogada na API. Removemos os segredos locais antes de persistir o novo contexto.
    await clearSession();
    await saveSession(result.accessToken,result.csrfToken);
    return result;
  },
  async logout(){try{await request<void>('/api/auth/logout',{method:'POST'});}finally{await clearSession();}},
  myProfile:()=>request<any>('/api/employees/me/profile'),
  myPayrolls:()=>request<any>('/api/payrolls/employee/me'),
  myPayroll:(id:number)=>request<any>(`/api/payrolls/employee/${id}`),
  signPayroll:(id:number,body:any)=>request<any>(`/api/payrolls/employee/${id}/sign`,{method:'POST',body:json(body)}),
  notifications:()=>request<any>('/api/notifications'),
  markNotificationRead:(id:number)=>request<void>(`/api/notifications/${id}/read`,{method:'POST'}),
  async downloadPayroll(id:number,filename:string){
    if(!accessToken) throw new ApiError('Sessão expirada.',401);
    const dir=FileSystem.cacheDirectory??FileSystem.documentDirectory;
    if(!dir) throw new Error('Armazenamento local indisponível.');
    const safe=filename.replace(/[^a-zA-Z0-9_.-]+/g,'-');
    const result=await FileSystem.downloadAsync(`${API_ROOT}/api/payrolls/employee/${id}/download`,`${dir}${safe}`,{headers:{Authorization:`Bearer ${accessToken}`,'X-PayHub-Client':'mobile'}});
    if(result.status<200||result.status>=300) throw new ApiError('Falha ao baixar o holerite.',result.status);
    return result.uri;
  }
};
