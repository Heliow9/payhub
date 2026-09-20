import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {AuthProvider} from '../auth/AuthProvider';
import {colors} from '../theme/colors';
export default function RootLayout(){return <AuthProvider><StatusBar style="dark"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.bg},animation:'slide_from_right'}}/></AuthProvider>}
