import {useState} from 'react';
import {Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {Redirect,Stack} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../../auth/AuthProvider';
import {CompanySelector} from '../../components/CompanySelector';
import {ErrorBanner,Loading} from '../../components/Ui';
import {colors} from '../../theme/colors';

export default function EmployeeLayout(){
  const{principal,loading,availableCompanies,switchCompany,sessionVersion}=useAuth();
  const[selectorOpen,setSelectorOpen]=useState(false);const[busyCompany,setBusyCompany]=useState<number|null>(null);const[error,setError]=useState('');
  if(loading)return <SafeAreaView style={{flex:1}}><Loading/></SafeAreaView>;
  if(!principal)return <Redirect href="/login"/>;
  if(principal.kind!=='EMPLOYEE')return <Redirect href="/admin-notice"/>;
  const historical=principal.accessMode==='HISTORICAL';
  async function choose(companyId:number){setBusyCompany(companyId);setError('');try{await switchCompany(companyId);setSelectorOpen(false);}catch(e){setError(e instanceof Error?e.message:'Não foi possível trocar de empresa.');}finally{setBusyCompany(null)}}
  return <View style={styles.root}>
    <SafeAreaView edges={['top']} style={styles.companyBarSafe}><View style={styles.companyBar}><View style={styles.companyCopy}><Text numberOfLines={1} style={styles.companyName}>{principal.companyName}</Text><Text style={[styles.companyMode,historical&&styles.historicalMode]}>{historical?'Vínculo encerrado · histórico':'Vínculo ativo'}</Text></View>{availableCompanies.length>1&&<Pressable onPress={()=>setSelectorOpen(true)} style={styles.switchButton}><Text style={styles.switchText}>↔ Trocar</Text></Pressable>}</View></SafeAreaView>
    <View style={styles.navigator}><Stack key={`${principal.companyId}-${sessionVersion}`} screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.bg}}}/></View>
    <Modal visible={selectorOpen} transparent animationType="slide" onRequestClose={()=>setSelectorOpen(false)}><View style={styles.modalBackdrop}><SafeAreaView style={styles.sheet}><View style={styles.sheetHandle}/><CompanySelector companies={availableCompanies} currentCompanyId={principal.companyId} busyCompanyId={busyCompany} title="Trocar empresa" subtitle="A sessão atual será encerrada e um novo contexto será carregado somente para a empresa escolhida." onSelect={(id)=>void choose(id)} onCancel={()=>setSelectorOpen(false)}/><ErrorBanner message={error}/></SafeAreaView></View></Modal>
  </View>;
}

const styles=StyleSheet.create({root:{flex:1,backgroundColor:colors.bg},navigator:{flex:1},companyBarSafe:{backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:colors.border},companyBar:{minHeight:51,paddingHorizontal:14,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:10},companyCopy:{flex:1,minWidth:0},companyName:{fontSize:12,fontWeight:'900',color:colors.text},companyMode:{fontSize:9,color:colors.green,fontWeight:'800',marginTop:2},historicalMode:{color:colors.amber},switchButton:{borderWidth:1,borderColor:colors.border,borderRadius:11,paddingHorizontal:12,paddingVertical:8,backgroundColor:'#fff'},switchText:{fontSize:11,fontWeight:'900',color:colors.primary},modalBackdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(12,18,34,.45)'},sheet:{maxHeight:'82%',backgroundColor:colors.bg,borderTopLeftRadius:26,borderTopRightRadius:26,paddingHorizontal:18,paddingBottom:18,paddingTop:8},sheetHandle:{alignSelf:'center',width:42,height:4,borderRadius:999,backgroundColor:'#CCD2DE',marginBottom:16}});
