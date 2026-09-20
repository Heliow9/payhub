import {Pressable,StyleSheet,Text,View} from 'react-native';
import type {CompanyOption} from '../lib/api';
import {mobileCompanyAccessLabel} from '../auth/company-selection';
import {colors} from '../theme/colors';

export function CompanySelector({companies,onSelect,busyCompanyId=null,currentCompanyId,title='Escolha a empresa',subtitle='Seu CPF possui vínculo com mais de uma empresa. Selecione qual contexto deseja acessar.',onCancel}:{companies:CompanyOption[];onSelect(companyId:number):void;busyCompanyId?:number|null;currentCompanyId?:number;title?:string;subtitle?:string;onCancel?():void}){
  return <View style={styles.root}>
    <View><Text style={styles.eyebrow}>CONTEXTO DA EMPRESA</Text><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
    <View style={styles.list}>{companies.map((company)=>{
      const historical=company.accessMode==='HISTORICAL';const current=company.companyId===currentCompanyId;const busy=busyCompanyId===company.companyId;
      return <Pressable key={`${company.companyId}-${company.employeeId}`} disabled={busyCompanyId!==null||current} onPress={()=>onSelect(company.companyId)} style={({pressed})=>[styles.option,historical&&styles.historical,current&&styles.current,pressed&&!current&&styles.pressed]}>
        <View style={[styles.icon,historical&&styles.historicalIcon]}><Text style={[styles.iconText,historical&&styles.historicalIconText]}>{company.companyName.slice(0,2).toUpperCase()}</Text></View>
        <View style={styles.copy}><Text numberOfLines={1} style={styles.name}>{company.companyName}</Text><Text style={styles.meta}>{mobileCompanyAccessLabel(company)}</Text><Text style={styles.employee}>{company.name}</Text></View>
        <Text style={styles.action}>{busy?'Abrindo…':current?'Atual':'Entrar'}</Text>
      </Pressable>;
    })}</View>
    {onCancel&&<Pressable onPress={onCancel} disabled={busyCompanyId!==null} style={styles.cancel}><Text style={styles.cancelText}>Cancelar</Text></Pressable>}
  </View>;
}

const styles=StyleSheet.create({root:{gap:15},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.2,color:colors.primary,marginBottom:6},title:{fontSize:23,fontWeight:'900',color:colors.text},subtitle:{fontSize:13,lineHeight:19,color:colors.muted,marginTop:6},list:{gap:9},option:{minHeight:74,borderWidth:1,borderColor:colors.border,borderRadius:16,backgroundColor:'#fff',padding:11,flexDirection:'row',alignItems:'center',gap:11},historical:{backgroundColor:'#FFFCF5',borderColor:'#EEE1C4'},current:{backgroundColor:'#F3F4FF',borderColor:'#C9CEFF'},pressed:{opacity:.8,transform:[{scale:.995}]},icon:{width:44,height:44,borderRadius:13,backgroundColor:'#EEF0FF',alignItems:'center',justifyContent:'center'},historicalIcon:{backgroundColor:colors.amberSoft},iconText:{fontSize:13,fontWeight:'900',color:colors.primary},historicalIconText:{color:colors.amber},copy:{flex:1,minWidth:0},name:{fontSize:14,fontWeight:'900',color:colors.text},meta:{fontSize:10,fontWeight:'700',color:colors.muted,marginTop:3},employee:{fontSize:10,color:'#929AAF',marginTop:2},action:{fontSize:11,fontWeight:'900',color:colors.primary},cancel:{alignItems:'center',padding:11},cancelText:{fontSize:13,fontWeight:'800',color:colors.muted}});
