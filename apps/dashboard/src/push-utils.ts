export function urlBase64ToUint8Array(base64String:string):Uint8Array<ArrayBuffer>{
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  if(typeof atob!=='function')throw new Error('Conversão Base64 indisponível neste navegador.');
  const raw=atob(base64);
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}
