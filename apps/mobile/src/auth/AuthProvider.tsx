import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {api,ApiError,clearSession,restoreSessionSecrets,type CompanyOption,type MobileAuthOutcome,type Principal} from '../lib/api';
import {isMobileCompanySelection,nextMobileAuthState,pendingMobileSelection,type MobileAuthState,type PendingMobileCompanySelection} from './company-selection';

type AuthValue={
  principal:Principal|null;
  loading:boolean;
  pendingSelection:PendingMobileCompanySelection|null;
  availableCompanies:CompanyOption[];
  sessionVersion:number;
  login(cpf:string,pin:string):Promise<MobileAuthState>;
  firstAccess(cpf:string,birthDate:string,pin:string):Promise<MobileAuthState>;
  selectCompany(companyId:number):Promise<void>;
  switchCompany(companyId:number):Promise<void>;
  cancelCompanySelection():void;
  logout():Promise<void>;
  refresh():Promise<void>;
};
const AuthContext=createContext<AuthValue|null>(null);

export function AuthProvider({children}:{children:ReactNode}){
  const[principal,setPrincipal]=useState<Principal|null>(null);
  const[loading,setLoading]=useState(true);
  const[pendingSelection,setPendingSelection]=useState<PendingMobileCompanySelection|null>(null);
  const[availableCompanies,setAvailableCompanies]=useState<CompanyOption[]>([]);
  const[sessionVersion,setSessionVersion]=useState(0);

  const loadCompanies=useCallback(async(nextPrincipal:Principal|null)=>{
    if(nextPrincipal?.kind!=='EMPLOYEE'){setAvailableCompanies([]);return;}
    try{const r=await api.companyOptions();setAvailableCompanies(r.companies);}catch{setAvailableCompanies([]);}
  },[]);

  const applyAuthenticated=useCallback(async(nextPrincipal:Principal)=>{
    setPrincipal(nextPrincipal);setPendingSelection(null);await loadCompanies(nextPrincipal);setSessionVersion(v=>v+1);
  },[loadCompanies]);

  const applyOutcome=useCallback(async(outcome:MobileAuthOutcome):Promise<MobileAuthState>=>{
    const state=nextMobileAuthState(outcome);
    if(isMobileCompanySelection(outcome)){
      setPrincipal(null);setAvailableCompanies([]);setPendingSelection(pendingMobileSelection(outcome));return state;
    }
    await applyAuthenticated(outcome.principal);return state;
  },[applyAuthenticated]);

  const refresh=useCallback(async()=>{
    try{const r=await api.me();setPrincipal(r.principal);setPendingSelection(null);if(!r.principal){setAvailableCompanies([]);await clearSession();return;}await loadCompanies(r.principal);}catch{setPrincipal(null);setAvailableCompanies([]);setPendingSelection(null);await clearSession();}
  },[loadCompanies]);

  useEffect(()=>{void restoreSessionSecrets().then(refresh).finally(()=>setLoading(false));},[refresh]);

  const value=useMemo<AuthValue>(()=>({
    principal,loading,pendingSelection,availableCompanies,sessionVersion,
    async login(cpf,pin){return applyOutcome(await api.login(cpf,pin));},
    async firstAccess(cpf,birthDate,pin){return applyOutcome(await api.firstAccess(cpf,birthDate,pin));},
    async selectCompany(companyId){
      if(!pendingSelection)throw new Error('Seleção de empresa expirada. Faça o login novamente.');
      try{const r=await api.selectCompany(pendingSelection.selectionToken,companyId);await applyAuthenticated(r.principal);}
      catch(error){if(error instanceof ApiError&&error.status===401){setPendingSelection(null);setAvailableCompanies([]);await clearSession();}throw error;}
    },
    async switchCompany(companyId){const r=await api.switchCompany(companyId);await applyAuthenticated(r.principal);},
    cancelCompanySelection(){setPendingSelection(null);},
    async logout(){await api.logout().catch(()=>clearSession());setPrincipal(null);setPendingSelection(null);setAvailableCompanies([]);setSessionVersion(v=>v+1);},
    refresh,
  }),[principal,loading,pendingSelection,availableCompanies,sessionVersion,applyOutcome,applyAuthenticated,refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(){const v=useContext(AuthContext);if(!v)throw new Error('AuthProvider ausente');return v;}
