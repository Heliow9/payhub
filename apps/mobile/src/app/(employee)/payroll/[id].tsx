import {useCallback,useState} from 'react';
import {ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router,useFocusEffect,useLocalSearchParams} from 'expo-router';
import * as Sharing from 'expo-sharing';
import {Button,ErrorBanner,Loading} from '../../../components/Ui';
import {PayrollDetail} from '../../../components/PayrollDetail';
import {api} from '../../../lib/api';
import {competence} from '../../../lib/format';
import {colors} from '../../../theme/colors';

export default function PayrollScreen(){
  const{id}=useLocalSearchParams<{id:string}>();const payrollId=Number(id);const[data,setData]=useState<any|null>(null);const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  const load=useCallback(async()=>{try{const r=await api.myPayroll(payrollId);setData(r.payroll);setError('')}catch(e){setError(e instanceof Error?e.message:'Falha ao abrir holerite.')}finally{setLoading(false)}},[payrollId]);
  useFocusEffect(useCallback(()=>{void load()},[load]));
  async function share(){if(!data)return;setBusy(true);setError('');try{const filename=`holerite-assinado-${data.year}-${String(data.month).padStart(2,'0')}.pdf`;const uri=await api.downloadPayroll(data.id,filename);if(await Sharing.isAvailableAsync())await Sharing.shareAsync(uri,{mimeType:'application/pdf',dialogTitle:`Holerite ${competence(data)}`,UTI:'com.adobe.pdf'});else setError('Compartilhamento não disponível neste aparelho.')}catch(e){setError(e instanceof Error?e.message:'Falha ao baixar holerite.')}finally{setBusy(false)}}
  if(loading)return <SafeAreaView style={{flex:1,backgroundColor:colors.bg}}><Loading label="Abrindo holerite…"/></SafeAreaView>;
  return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.header}><Button variant="ghost" style={styles.back} onPress={()=>router.back()}>‹ Voltar</Button><View style={styles.headerCopy}><Text style={styles.headerTitle}>{data?competence(data):'Holerite'}</Text><Text style={styles.headerSub}>{data?.payroll_type_label??data?.payrollTypeLabel??''}</Text></View><View style={{width:72}}/></View><ScrollView contentContainerStyle={styles.content}><ErrorBanner message={error}/>{data?<><PayrollDetail data={data}/>{data.status==='SIGNED'?<View style={styles.bottom}><Button disabled={busy} onPress={()=>void share()}>{busy?'Preparando PDF…':'Baixar / compartilhar PDF'}</Button></View>:<View style={styles.bottom}><Button onPress={()=>router.push({pathname:'/(employee)/sign/[id]',params:{id:String(data.id)}})}>Assinar eletronicamente</Button></View>}</>:<Text style={styles.empty}>Holerite não encontrado.</Text>}</ScrollView></SafeAreaView>
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.bg},header:{minHeight:66,paddingHorizontal:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:colors.border},back:{width:90,minHeight:42,paddingHorizontal:4},headerCopy:{alignItems:'center',flex:1},headerTitle:{fontSize:15,fontWeight:'900',color:colors.text},headerSub:{fontSize:10,color:colors.muted,fontWeight:'600',marginTop:2},content:{padding:14,paddingBottom:40},bottom:{marginTop:20},empty:{textAlign:'center',padding:30,color:colors.muted}})
