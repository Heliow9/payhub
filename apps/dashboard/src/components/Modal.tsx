import { useEffect, type ReactNode } from 'react';
export function Modal({title,onClose,children,wide=false}:{title:string;onClose():void;children:ReactNode;wide?:boolean}){
  useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow='hidden';const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};document.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',onKey);};},[onClose]);
  return <div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}><section className={`modal ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-label={title}><header><div><span className="eyebrow">PAYHUB</span><h3>{title}</h3></div><button className="icon-button" onClick={onClose} aria-label="Fechar">×</button></header><div className="modal-body">{children}</div></section></div>;
}
