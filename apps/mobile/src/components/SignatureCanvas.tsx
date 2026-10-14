import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../theme/colors';

export type SignatureCanvasHandle={read():void;clear():void};

const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;overscroll-behavior:none;background:#fff}canvas{display:block;width:100%;height:100%;touch-action:none}</style></head><body><canvas id="c"></canvas><script>
const c=document.getElementById('c'),x=c.getContext('2d');let pointer=null,dirty=false;
function size(){const r=c.getBoundingClientRect(),scale=Math.min(Math.max(window.devicePixelRatio||1,1),2);c.width=Math.max(1,Math.round(r.width*scale));c.height=Math.max(1,Math.round(r.height*scale));x.setTransform(scale,0,0,scale,0,0);x.lineWidth=2.4;x.lineCap='round';x.lineJoin='round';x.strokeStyle='#16213e'}
function p(e){const r=c.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]}
function down(e){if(pointer!==null)return;e.preventDefault();pointer=e.pointerId;c.setPointerCapture&&c.setPointerCapture(pointer);const q=p(e);x.beginPath();x.moveTo(q[0],q[1]);window.ReactNativeWebView.postMessage(JSON.stringify({type:'stroke',active:true}))}
function move(e){if(e.pointerId!==pointer)return;e.preventDefault();const samples=e.getCoalescedEvents?e.getCoalescedEvents():[e];for(const sample of samples){const q=p(sample);x.lineTo(q[0],q[1])}x.stroke();dirty=true}
function up(e){if(e.pointerId!==pointer)return;e.preventDefault();if(c.hasPointerCapture&&c.hasPointerCapture(pointer))c.releasePointerCapture(pointer);pointer=null;window.ReactNativeWebView.postMessage(JSON.stringify({type:'stroke',active:false}));if(dirty)window.ReactNativeWebView.postMessage(JSON.stringify({type:'changed'}))}
c.addEventListener('pointerdown',down);c.addEventListener('pointermove',move);c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);
function read(){if(!dirty)return;window.ReactNativeWebView.postMessage(JSON.stringify({type:'signature',data:c.toDataURL('image/png')}))}
function clear(){x.clearRect(0,0,c.width,c.height);dirty=false;window.ReactNativeWebView.postMessage(JSON.stringify({type:'cleared'}))}
requestAnimationFrame(size);
</script></body></html>`;

export const SignatureCanvas=forwardRef<SignatureCanvasHandle,{onSignature(value:string):void;onChanged?(value:boolean):void;onStrokeActive?(value:boolean):void}>(({onSignature,onChanged,onStrokeActive},ref)=>{
  const web=useRef<WebView>(null);
  useImperativeHandle(ref,()=>({read:()=>web.current?.injectJavaScript('read();true;'),clear:()=>web.current?.injectJavaScript('clear();true;')}));
  return <View><View style={styles.frame} onTouchStart={()=>onStrokeActive?.(true)} onTouchEnd={()=>onStrokeActive?.(false)} onTouchCancel={()=>onStrokeActive?.(false)}><WebView ref={web} source={{html}} originWhitelist={['*']} scrollEnabled={false} bounces={false} overScrollMode="never" onMessage={event=>{try{const message=JSON.parse(event.nativeEvent.data);if(message.type==='signature')onSignature(message.data);if(message.type==='changed')onChanged?.(true);if(message.type==='cleared')onChanged?.(false);if(message.type==='stroke')onStrokeActive?.(Boolean(message.active));}catch{}}}/></View><Text style={styles.help}>Assine com o dedo dentro do quadro.</Text></View>;
});
SignatureCanvas.displayName='SignatureCanvas';
const styles=StyleSheet.create({frame:{height:185,borderWidth:1,borderColor:colors.border,borderRadius:16,overflow:'hidden',backgroundColor:'#fff'},help:{fontSize:11,color:colors.muted,marginTop:7}});
