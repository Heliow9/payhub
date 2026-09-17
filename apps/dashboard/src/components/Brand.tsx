export function Brand({compact=false,subtitle}:{compact?:boolean;subtitle?:string}){
  return <div className={`brand ${compact?'brand-compact':''}`}>
    <img className="brand-mark" src="/assets/payhub-mark.png" alt=""/>
    <div><strong>PayHub</strong><span>{subtitle??'Gestão de holerites'}</span></div>
  </div>
}

export function FullBrand({className=''}:{className?:string}){
  return <div className={`full-brand-lockup ${className}`} role="img" aria-label="PayHub — Sistema de Gestão de Holerite">
    <div className="full-brand-mark-wrap"><img className="full-brand-mark" src="/assets/payhub-mark.png" alt=""/></div>
    <div className="full-brand-copy"><strong>PAYHUB</strong><span>SISTEMA DE GESTÃO DE HOLERITE</span></div>
  </div>
}
