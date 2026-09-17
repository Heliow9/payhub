export const ALL_NOTIFICATION_CATEGORIES=['PAYROLL_AVAILABLE','SIGNATURE_COMPLETED','IMPORT_COMPLETED','IMPORT_FAILED','PENDING_SIGNATURES','CONNECTOR_OFFLINE','SECURITY','SYSTEM'] as const;
export type NotificationCategory=typeof ALL_NOTIFICATION_CATEGORIES[number];
export type NotificationPrincipalHint={kind:'EMPLOYEE'}|{kind:'USER';role:'MASTER'|'ANALISTA'};
export function defaultPushCategories(principal:NotificationPrincipalHint):NotificationCategory[]{
  if(principal.kind==='EMPLOYEE')return['PAYROLL_AVAILABLE','SIGNATURE_COMPLETED','SYSTEM'];
  return principal.role==='MASTER'
    ?['IMPORT_COMPLETED','IMPORT_FAILED','PENDING_SIGNATURES','CONNECTOR_OFFLINE','SECURITY','SYSTEM']
    :['IMPORT_COMPLETED','IMPORT_FAILED','PENDING_SIGNATURES','CONNECTOR_OFFLINE','SYSTEM'];
}
export function notificationPayload(input:{title:string;body:string;url?:string|null;category:NotificationCategory;notificationId?:number|null}){
  const safeUrl=input.url&&input.url.startsWith('/')&&!input.url.startsWith('//')?input.url:'/';
  return{title:input.title.slice(0,120),body:input.body.slice(0,300),url:safeUrl,category:input.category,notificationId:input.notificationId??null};
}
