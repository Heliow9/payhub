export type UserPrincipal={kind:'USER';id:number;companyId:number;companyName:string;name:string;email:string;role:'MASTER'|'ANALISTA';status:'ACTIVE'|'DISABLED'};
export type EmployeePrincipal={kind:'EMPLOYEE';id:number;identityId:number;companyId:number;companyName:string;name:string;cpf:string;status:'ACTIVE'|'DISABLED'|'TERMINATED';accessMode:'FULL'|'HISTORICAL'};
export type Principal=UserPrincipal|EmployeePrincipal;
export type CompanyOption={companyId:number;companyName:string;employeeId:number;name:string;status:'ACTIVE'|'TERMINATED';accessMode:'FULL'|'HISTORICAL'};
export type AuthSession={principal:Principal;csrfToken:string};
export type CompanySelectionOutcome={requiresCompanySelection:true;selectionToken:string;companies:CompanyOption[]};
export type AuthOutcome=AuthSession|CompanySelectionOutcome;

export class ApiError extends Error{constructor(message:string,public status:number,public code?:string,public details?:unknown){super(message);}}
let csrfToken=sessionStorage.getItem('payhub_csrf')??'';
export function setCsrfToken(value:string){csrfToken=value;if(value)sessionStorage.setItem('payhub_csrf',value);else sessionStorage.removeItem('payhub_csrf');}


function csrfFromCookie():string{

  const item=document.cookie

    .split('; ')

    .find((value)=>value.startsWith('payhub_csrf='));

  return item ? decodeURIComponent(item.slice('payhub_csrf='.length)) : '';

}



function currentCsrfToken():string{

  return csrfFromCookie() || csrfToken;

}



async function request<T>(path:string,options:RequestInit={}):Promise<T>{const headers=new Headers(options.headers);if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');const csrf=currentCsrfToken();if(options.method&&options.method!=='GET'&&options.method!=='HEAD'&&csrf)headers.set('x-csrf-token',csrf);const response=await fetch(path,{...options,headers,credentials:'include'});if(response.status===204)return undefined as T;const contentType=response.headers.get('content-type')??'';if(!response.ok){let payload:any={};if(contentType.includes('application/json'))payload=await response.json().catch(()=>({}));throw new ApiError(payload.error??`Erro HTTP ${response.status}`,response.status,payload.code,payload.details);}return contentType.includes('application/json')?response.json():response.text() as T;}
const json=(value:unknown)=>JSON.stringify(value);

async function requestDownload(path:string,options:RequestInit={},fallbackFilename='payhub-download.bin'):Promise<{blob:Blob;filename:string}>{const headers=new Headers(options.headers);if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');const csrf=currentCsrfToken();if(options.method&&options.method!=='GET'&&options.method!=='HEAD'&&csrf)headers.set('x-csrf-token',csrf);const response=await fetch(path,{...options,headers,credentials:'include'});if(!response.ok){const contentType=response.headers.get('content-type')??'';let payload:any={};if(contentType.includes('application/json'))payload=await response.json().catch(()=>({}));throw new ApiError(payload.error??`Erro HTTP ${response.status}`,response.status,payload.code,payload.details);}const disposition=response.headers.get('content-disposition')??'';const match=/filename="?([^";]+)"?/i.exec(disposition);return{blob:await response.blob(),filename:match?.[1]??fallbackFilename};}

export const api={
  me:()=>request<{principal:Principal|null;csrfToken:string}>('/api/auth/me'),
  login:(identifier:string,password:string)=>request<AuthOutcome>('/api/auth/login',{method:'POST',body:json({identifier,password})}),
  firstAccess:(cpf:string,birthDate:string,pin:string)=>request<AuthOutcome>('/api/auth/employee-first-access',{method:'POST',body:json({cpf,birthDate,pin})}),
  selectCompany:(selectionToken:string,companyId:number)=>request<AuthSession>('/api/auth/select-company',{method:'POST',body:json({selectionToken,companyId})}),
  companyOptions:()=>request<{companies:CompanyOption[]}>('/api/auth/companies'),
  switchCompany:(companyId:number)=>request<AuthSession>('/api/auth/switch-company',{method:'POST',body:json({companyId,client:'WEB'})}),
  logout:()=>request<void>('/api/auth/logout',{method:'POST'}),
  dashboard:()=>request<any>('/api/dashboard'),
  users:()=>request<any>('/api/users'),createAnalyst:(body:any)=>request<any>('/api/users',{method:'POST',body:json(body)}),setUserStatus:(id:number,status:string)=>request<void>(`/api/users/${id}/status`,{method:'PATCH',body:json({status})}),
  employees:(params:Record<string,string|number|undefined>={})=>{const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!=='')q.set(k,String(v));});return request<any>(`/api/employees?${q}`);},employee:(id:number)=>request<any>(`/api/employees/${id}`),employeeLookup:(cpf:string)=>request<any>('/api/employees/lookup',{method:'POST',body:json({cpf})}),employeeLookupResult:(jobId:number)=>request<any>(`/api/employees/lookup/${jobId}/result`),createEmployee:(lookupJobId:number,groupId:number,phone?:string)=>request<any>('/api/employees',{method:'POST',body:json({lookupJobId,groupId,phone})}),moveEmployee:(id:number,groupId:number)=>request<void>(`/api/employees/${id}/group`,{method:'PATCH',body:json({groupId})}),setEmployeeStatus:(id:number,status:string)=>request<void>(`/api/employees/${id}/status`,{method:'PATCH',body:json({status})}),deleteEmployee:(id:number)=>request<void>(`/api/employees/${id}`,{method:'DELETE'}),startEmployeeSageSync:(id:number)=>request<{jobId:number}>(`/api/employees/${id}/sync-sage`,{method:'POST'}),applyEmployeeSageSync:(id:number,jobId:number)=>request<void>(`/api/employees/${id}/sync-sage/apply`,{method:'POST',body:json({jobId})}),searchEmployeeNow:(id:number,body:{year:number;month:number;types:number[]})=>request<any>(`/api/employees/${id}/search-now`,{method:'POST',body:json(body)}),
  groups:()=>request<any>('/api/groups'),group:(id:number)=>request<any>(`/api/groups/${id}`),groupRuns:(id:number,limit=25)=>request<any>(`/api/groups/${id}/runs?limit=${limit}`),runEvents:(runId:number)=>request<any>(`/api/groups/runs/${runId}/events`),createGroup:(body:any)=>request<any>('/api/groups',{method:'POST',body:json(body)}),updateGroup:(id:number,body:any)=>request<void>(`/api/groups/${id}`,{method:'PUT',body:json(body)}),searchGroupNow:(id:number,body:{year:number;month:number;types:number[]})=>request<any>(`/api/groups/${id}/search-now`,{method:'POST',body:json(body)}),
  payrolls:(params:Record<string,string|number|undefined>={})=>{const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!=='')q.set(k,String(v));});return request<any>(`/api/payrolls?${q}`);},payrollSelection:(params:Record<string,string|number|undefined>={})=>{const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!=='')q.set(k,String(v));});return request<any>(`/api/payrolls/selection?${q}`);},payroll:(id:number)=>request<any>(`/api/payrolls/${id}`),releasePayroll:(id:number)=>request<any>(`/api/payrolls/${id}/release`,{method:'POST'}),releaseSelectedPayrolls:(ids:number[])=>request<any>('/api/payrolls/release-selected',{method:'POST',body:json({ids})}),signatureLink:(id:number,ttlMinutes?:number)=>request<any>(`/api/payrolls/${id}/signature-link`,{method:'POST',body:json(ttlMinutes?{ttlMinutes}:{})}),evidence:(id:number)=>request<any>(`/api/payrolls/${id}/evidence`),exportSelectedPayrolls:(ids:number[])=>requestDownload('/api/payrolls/export-selected',{method:'POST',body:json({ids})}),
  myProfile:()=>request<any>('/api/employees/me/profile'),
  myPayrolls:()=>request<any>('/api/payrolls/employee/me'),myPayroll:(id:number)=>request<any>(`/api/payrolls/employee/${id}`),downloadMyPayroll:(id:number)=>requestDownload(`/api/payrolls/employee/${id}/download`,{},`holerite-assinado-${id}.pdf`),signPayroll:(id:number,body:any)=>request<any>(`/api/payrolls/employee/${id}/sign`,{method:'POST',body:json(body)}),
  connectors:()=>request<any>('/api/connectors'),createConnector:(name:string)=>request<any>('/api/connectors',{method:'POST',body:json({name})}),jobs:()=>request<any>('/api/import-jobs'),createJob:(jobType:string,scope:any=null)=>request<any>('/api/import-jobs',{method:'POST',body:json({jobType,scope})}),job:(id:number)=>request<any>(`/api/import-jobs/${id}`),jobLogs:(id:number)=>request<any>(`/api/import-jobs/${id}/logs`),
  settings:()=>request<any>('/api/settings'),updateSettings:(body:any)=>request<void>('/api/settings',{method:'PUT',body:json(body)}),audit:()=>request<any>('/api/audit'),
  notifications:()=>request<any>('/api/notifications'),pushInfo:()=>request<any>('/api/notifications/vapid-key'),notificationPreferences:()=>request<any>('/api/notifications/preferences'),updateNotificationPreferences:(preferences:Record<string,boolean>)=>request<void>('/api/notifications/preferences',{method:'PUT',body:json(preferences)}),markNotificationRead:(id:number)=>request<void>(`/api/notifications/${id}/read`,{method:'POST'}),markAllNotificationsRead:()=>request<void>('/api/notifications/read-all',{method:'POST'}),subscribePush:(body:any)=>request<void>('/api/notifications/subscribe',{method:'POST',body:json(body)}),unsubscribePush:(body:any)=>request<void>('/api/notifications/unsubscribe',{method:'POST',body:json(body)}),
  verifyDocument:(documentNumber:string)=>request<any>(`/api/public/verify/${encodeURIComponent(documentNumber)}`),verifyDocumentFileHash:(documentNumber:string,sha256:string)=>request<any>(`/api/public/verify/${encodeURIComponent(documentNumber)}/file-hash`,{method:'POST',body:json({sha256})}),
  publicSignInfo:(token:string)=>request<any>(`/api/public/sign/${encodeURIComponent(token)}`),publicSignVerify:(token:string,body:any)=>request<any>(`/api/public/sign/${encodeURIComponent(token)}/verify`,{method:'POST',body:json(body)}),publicSign:(token:string,body:any)=>request<any>(`/api/public/sign/${encodeURIComponent(token)}/sign`,{method:'POST',body:json(body)})
};
