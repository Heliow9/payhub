export function urlBase64ToUint8Array(base64String:string):Uint8Array{
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  if(typeof atob!=='function')throw new Error('Conversão Base64 indisponível neste navegador.');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map((char)=>char.charCodeAt(0)));
}
