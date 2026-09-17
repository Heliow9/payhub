import { useEffect,useState } from 'react';
import { AuthProvider,useAuth } from './auth/AuthProvider';
import { AppShell,navigate } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { GroupsPage } from './pages/GroupsPage';
import { PayrollsPage } from './pages/PayrollsPage';
import { UsersPage } from './pages/UsersPage';
import { SageIntegrationPage } from './pages/SageIntegrationPage';
import { AuditPage } from './pages/AuditPage';
import { SettingsPage } from './pages/SettingsPage';
import { EmployeePortalPage } from './pages/EmployeePortalPage';
import { PublicSignPage } from './pages/PublicSignPage';
import { FullBrand } from './components/Brand';

function hashRoute(){const raw=window.location.hash.replace(/^#\/?/,'');const parts=raw.split('/').filter(Boolean);return{page:parts[0]||'dashboard',parts};}
export function App(){return <AuthProvider><AppRouter/></AuthProvider>}
function AppRouter(){const{principal,loading}=useAuth();const[route,setRoute]=useState(hashRoute());useEffect(()=>{const fn=()=>setRoute(hashRoute());window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn);},[]);if(route.page==='sign'&&route.parts[1])return <PublicSignPage token={route.parts[1]}/>;if(loading)return <div className="app-loading"><FullBrand className="loading-brand pulse"/><span>Carregando ambiente seguro…</span><div className="loading-track"><i/></div></div>;if(!principal)return <LoginPage/>;if(principal.kind==='EMPLOYEE')return <EmployeePortalPage/>;const allowed=principal.role==='MASTER'?['dashboard','employees','groups','payrolls','users','integration','audit','settings']:['dashboard','employees','groups','payrolls','integration'];const page=allowed.includes(route.page)?route.page:'dashboard';if(page!==route.page)setTimeout(()=>navigate(page),0);const content=page==='employees'?<EmployeesPage/>:page==='groups'?<GroupsPage/>:page==='payrolls'?<PayrollsPage/>:page==='users'?<UsersPage/>:page==='integration'?<SageIntegrationPage/>:page==='audit'?<AuditPage/>:page==='settings'?<SettingsPage/>:<DashboardPage/>;return <AppShell page={page}>{content}</AppShell>}
