import { useEffect, useRef } from 'react';

export function SignatureCanvas({ onChange }: { onChange(value: string): void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const exportVersion = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#16213e';
    let activePointer: number | null = null;

    const point = (event: Pick<PointerEvent, 'clientX' | 'clientY'>) => {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
    };
    const down = (event: PointerEvent) => {
      if (activePointer !== null) return;
      event.preventDefault();
      activePointer = event.pointerId;
      const current = point(event);
      ctx.beginPath();
      ctx.moveTo(current.x, current.y);
      canvas.setPointerCapture?.(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== activePointer) return;
      event.preventDefault();
      const samples = event.getCoalescedEvents?.() ?? [event];
      for (const sample of samples) {
        const current = point(sample);
        ctx.lineTo(current.x, current.y);
      }
      ctx.stroke();
    };
    const finish = (event: PointerEvent) => {
      if (event.pointerId !== activePointer) return;
      event.preventDefault();
      activePointer = null;
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      const version = ++exportVersion.current;
      if (!canvas.toBlob) {
        onChange(canvas.toDataURL('image/png'));
        return;
      }
      canvas.toBlob((blob) => {
        if (!blob || version !== exportVersion.current) return;
        const reader = new FileReader();
        reader.addEventListener('load', () => {
          if (version === exportVersion.current && typeof reader.result === 'string') onChange(reader.result);
        });
        reader.readAsDataURL(blob);
      }, 'image/png');
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', finish);
      canvas.removeEventListener('pointercancel', finish);
    };
  }, [onChange]);

  return <div><canvas ref={ref} width={760} height={300} className="signature-canvas"/><div className="row gap"><button type="button" className="secondary-button compact" onClick={()=>{const canvas=ref.current;if(!canvas)return;exportVersion.current+=1;canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);onChange('');}}>Limpar assinatura</button><span className="muted small">Assine com o dedo, caneta ou mouse.</span></div></div>;
}
