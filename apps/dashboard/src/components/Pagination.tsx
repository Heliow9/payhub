import { useMemo } from 'react';

type PaginationProps={
  page:number;
  pageSize:number;
  total:number;
  onPageChange:(page:number)=>void;
  onPageSizeChange?:(size:number)=>void;
  pageSizes?:number[];
  label?:string;
};

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}

export function Pagination({page,pageSize,total,onPageChange,onPageSizeChange,pageSizes=[10,25,50,100],label='registros'}:PaginationProps){
  const totalPages=Math.max(1,Math.ceil(total/pageSize));
  const current=clamp(page,1,totalPages);
  const start=total===0?0:(current-1)*pageSize+1;
  const end=Math.min(total,current*pageSize);
  const pages=useMemo(()=>{
    const values:number[]=[];
    const from=Math.max(1,current-2);
    const to=Math.min(totalPages,current+2);
    if(from>1)values.push(1);
    for(let value=from;value<=to;value++)if(!values.includes(value))values.push(value);
    if(to<totalPages&&!values.includes(totalPages))values.push(totalPages);
    return values;
  },[current,totalPages]);
  if(total===0)return null;
  return <div className="pagination-bar" aria-label="Paginação">
    <div className="pagination-summary"><strong>{start}–{end}</strong><span>de {total} {label}</span></div>
    <div className="pagination-controls">
      {onPageSizeChange&&<label className="page-size">Por página<select value={pageSize} onChange={(event)=>onPageSizeChange(Number(event.target.value))}>{pageSizes.map((size)=><option key={size} value={size}>{size}</option>)}</select></label>}
      <button className="pagination-nav" disabled={current<=1} onClick={()=>onPageChange(current-1)} aria-label="Página anterior">‹</button>
      <div className="pagination-pages">{pages.map((value,index)=>{
        const previous=pages[index-1];
        return <span key={value} className="pagination-page-wrap">{previous&&value-previous>1&&<i>…</i>}<button className={value===current?'active':''} onClick={()=>onPageChange(value)} aria-current={value===current?'page':undefined}>{value}</button></span>;
      })}</div>
      <button className="pagination-nav" disabled={current>=totalPages} onClick={()=>onPageChange(current+1)} aria-label="Próxima página">›</button>
    </div>
  </div>;
}
