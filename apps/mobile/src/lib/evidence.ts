import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Location from 'expo-location';
import {Dimensions,Platform,PixelRatio} from 'react-native';

export async function collectSignatureEvidence(){
  const screen=Dimensions.get('screen');
  let location:any={status:'UNSUPPORTED',permission:'unknown'};
  try{
    const permission=await Location.requestForegroundPermissionsAsync();
    if(permission.status!=='granted') location={status:'DENIED',permission:permission.status==='denied'?'denied':'unknown'};
    else {
      let timedOut=false;
      const timeout=new Promise<null>((resolve)=>setTimeout(()=>{timedOut=true;resolve(null)},8000));
      const current=Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}).catch(()=>null);
      const pos=await Promise.race([current,timeout]) ?? await Location.getLastKnownPositionAsync({maxAge:120000,requiredAccuracy:500}).catch(()=>null);
      if(pos) location={status:'CAPTURED',permission:'granted',latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracyMeters:pos.coords.accuracy,altitude:pos.coords.altitude,altitudeAccuracyMeters:pos.coords.altitudeAccuracy,heading:pos.coords.heading,speedMps:pos.coords.speed,capturedAt:new Date(pos.timestamp).toISOString()};
      else location={status:timedOut?'TIMEOUT':'UNAVAILABLE',permission:'granted'};
    }
  }catch(error){location={status:'ERROR',permission:'unknown',errorMessage:error instanceof Error?error.message:String(error)};}
  return {captureVersion:'2',capturedAt:new Date().toISOString(),originHint:'ANDROID',device:{type:Device.deviceType===Device.DeviceType.PHONE?'PHONE':Device.deviceType===Device.DeviceType.TABLET?'TABLET':'UNKNOWN',brand:Device.brand,model:Device.modelName,manufacturer:Device.manufacturer,platform:Platform.OS,platformVersion:String(Platform.Version),osName:Device.osName,osVersion:Device.osVersion,appVersion:Application.nativeApplicationVersion,architecture:null,mobile:true,screenWidth:screen.width,screenHeight:screen.height,pixelRatio:PixelRatio.get(),language:'pt-BR',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,userAgent:`PayHub Android/${Application.nativeApplicationVersion??'dev'}`},location};
}
