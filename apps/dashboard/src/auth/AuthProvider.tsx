import { createContext,useContext,useEffect,useMemo,useState,type ReactNode } from 'react';
import { api,setCsrfToken,type Principal } from '../api/client';

type AuthContextValue={principal:Principal|null;loading:boolean;login(identifier:string,password:string):Promise<void>;firstAccess(cpf:string,birthDate:string,pin:string):Promise<void>;logout():Promise<void>};
const AuthContext=createContext<AuthContextValue|null>(null);
export function AuthProvider({children}:{children:ReactNode}){const[principal,setPrincipal]=useState<Principal|null>(null);const[loading,setLoading]=useState(true);useEffect(()=>{api.me().then((r)=>setPrincipal(r.principal)).catch(()=>setPrincipal(null)).finally(()=>setLoading(false));},[]);const value=useMemo<AuthContextValue>(()=>({principal,loading,async login(identifier,password){const r=await api.login(identifier,password);setCsrfToken(r.csrfToken);setPrincipal(r.principal);},async firstAccess(cpf,birthDate,pin){const r=await api.firstAccess(cpf,birthDate,pin);setCsrfToken(r.csrfToken);setPrincipal(r.principal);},async logout(){await api.logout().catch(()=>undefined);setCsrfToken('');setPrincipal(null);}}),[principal,loading]);return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>}
export function useAuth(){const v=useContext(AuthContext);if(!v)throw new Error('AuthProvider ausente');return v;}
