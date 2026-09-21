export function startWatchdog(input:{
  timeoutMs:number;
  snapshot:()=>{phase:string;jobId:number|null};
  onTimeout?:()=>void|Promise<void>;
  exit?:(code:number)=>void;
}):{clear():void}{
  let cleared=false;
  const exit=input.exit??((code)=>process.exit(code));
  const timer=setTimeout(()=>{
    if(cleared)return;
    const state=input.snapshot();
    console.error('[worker] watchdog timeout',{...state,timeoutMs:input.timeoutMs});
    let exited=false;
    const force=setTimeout(()=>{if(!exited){exited=true;exit(1);}},1000);force.unref();
    Promise.resolve(input.onTimeout?.()).catch(()=>undefined).finally(()=>{if(!exited){exited=true;clearTimeout(force);exit(1);}});
  },input.timeoutMs);
  timer.unref();
  return{clear:()=>{cleared=true;clearTimeout(timer);}};
}
