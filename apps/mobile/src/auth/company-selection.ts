export type MobileCompanyOption={
  employeeId:number;
  companyId:number;
  companyName:string;
  name:string;
  status:'ACTIVE'|'TERMINATED';
  accessMode:'FULL'|'HISTORICAL';
};

export type MobileCompanySelectionLike={
  requiresCompanySelection:true;
  selectionToken:string;
  companies:MobileCompanyOption[];
};

export type MobileAuthState='AUTHENTICATED'|'SELECT_COMPANY';
export type PendingMobileCompanySelection={selectionToken:string;companies:MobileCompanyOption[]};

export function isMobileCompanySelection(outcome:object):outcome is MobileCompanySelectionLike{
  return 'requiresCompanySelection' in outcome&&(outcome as {requiresCompanySelection?:unknown}).requiresCompanySelection===true;
}

export function nextMobileAuthState(outcome:object):MobileAuthState{
  return isMobileCompanySelection(outcome)?'SELECT_COMPANY':'AUTHENTICATED';
}

export function pendingMobileSelection(outcome:MobileCompanySelectionLike):PendingMobileCompanySelection{
  return {selectionToken:outcome.selectionToken,companies:outcome.companies};
}

export function mobileCompanyAccessLabel(company:Pick<MobileCompanyOption,'accessMode'>){
  return company.accessMode==='HISTORICAL'?'Vínculo encerrado · acesso aos documentos anteriores':'Vínculo ativo';
}
