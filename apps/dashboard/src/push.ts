import { api } from './api/client';

import { urlBase64ToUint8Array } from './push-utils';
export { urlBase64ToUint8Array } from './push-utils';

export async function currentPushSubscription():Promise<PushSubscription|null>{if(!('serviceWorker' in navigator)||!('PushManager' in window))return null;const registration=await navigator.serviceWorker.ready;return registration.pushManager.getSubscription();}

export async function enablePushNotifications():Promise<{enabled:boolean;reason?:string}>{
  if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window))return{enabled:false,reason:'Este navegador não oferece Web Push.'};
  const info=await api.pushInfo();if(!info.enabled||!info.publicKey)return{enabled:false,reason:'Web Push ainda não foi configurado pelo administrador.'};
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();if(permission!=='granted')return{enabled:false,reason:'Permissão de notificações não concedida.'};
  const registration=await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(info.publicKey)});
  const json=subscription.toJSON();if(!json.endpoint||!json.keys?.p256dh||!json.keys?.auth)return{enabled:false,reason:'Subscription Web Push incompleta.'};
  await api.subscribePush({endpoint:json.endpoint,keys:{p256dh:json.keys.p256dh,auth:json.keys.auth}});
  return{enabled:true};
}

export async function disablePushNotifications():Promise<void>{const subscription=await currentPushSubscription();if(!subscription)return;await api.unsubscribePush({endpoint:subscription.endpoint}).catch(()=>undefined);await subscription.unsubscribe();}
