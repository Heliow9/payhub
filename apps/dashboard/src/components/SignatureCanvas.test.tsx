import { fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignatureCanvas } from './SignatureCanvas';

function pointerEvent(type:string, x:number, y:number, pointerId=1) {
  const event=new Event(type,{bubbles:true,cancelable:true});
  Object.defineProperties(event,{
    clientX:{value:x},clientY:{value:y},pointerId:{value:pointerId},
  });
  return event;
}

describe('SignatureCanvas',()=>{
  afterEach(()=>vi.restoreAllMocks());

  it('desenha todas as amostras coalescidas e exporta sem bloquear o fim do traço',async()=>{
    const lineTo=vi.fn();
    const context={beginPath:vi.fn(),moveTo:vi.fn(),lineTo,stroke:vi.fn(),clearRect:vi.fn(),lineWidth:0,lineCap:'butt',strokeStyle:''} as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:380,height:180,right:380,bottom:180,x:0,y:0,toJSON:()=>({})});
    const toDataURL=vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,dGVzdA==');
    vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation((callback)=>callback(new Blob(['test'],{type:'image/png'})));
    const onChange=vi.fn();
    const{container}=render(<SignatureCanvas onChange={onChange}/>);
    const canvas=container.querySelector('canvas')!;
    Object.defineProperty(canvas,'setPointerCapture',{value:vi.fn()});
    fireEvent(canvas,pointerEvent('pointerdown',10,10));
    const move=pointerEvent('pointermove',40,40) as PointerEvent;
    Object.defineProperty(move,'getCoalescedEvents',{value:()=>[
      {clientX:20,clientY:20},{clientX:30,clientY:30},{clientX:40,clientY:40},
    ]});
    fireEvent(canvas,move);
    fireEvent(canvas,pointerEvent('pointerup',40,40));
    expect(lineTo).toHaveBeenCalledTimes(3);
    expect(toDataURL).not.toHaveBeenCalled();
    await waitFor(()=>expect(onChange).toHaveBeenCalledOnce());
  });
});
