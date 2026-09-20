import {Image,StyleSheet,Text,View} from 'react-native';
import {colors} from '../theme/colors';
export function Brand({light=false,subtitle='Portal do funcionário'}:{light?:boolean;subtitle?:string}){return <View style={styles.wrap}><Image source={require('../../assets/images/payhub-mark.png')} style={styles.logo}/><View><Text style={[styles.name,light&&styles.light]}>PayHub</Text><Text style={[styles.sub,light&&styles.subLight]}>{subtitle}</Text></View></View>}
const styles=StyleSheet.create({wrap:{flexDirection:'row',alignItems:'center',gap:10},logo:{width:42,height:42,resizeMode:'contain'},name:{fontSize:20,fontWeight:'900',color:colors.text},light:{color:'#fff'},sub:{fontSize:11,color:colors.muted,fontWeight:'600'},subLight:{color:'#B8C8E7'}});
