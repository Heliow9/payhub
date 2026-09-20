import {Redirect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {Loading} from '../components/Ui';
import {colors} from '../theme/colors';
export default function Index(){const{principal,loading}=useAuth();if(loading)return <SafeAreaView style={{flex:1,backgroundColor:colors.bg}}><Loading label="Abrindo PayHub…"/></SafeAreaView>;if(!principal)return <Redirect href="/login"/>;if(principal.kind==='EMPLOYEE')return <Redirect href="/(employee)"/>;return <Redirect href="/admin-notice"/>;}
