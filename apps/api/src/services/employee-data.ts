export interface SageEmployeeData{
  name:string;
  birthDate:string;
  admissionDate?:string|null;
  jobTitle?:string|null;
  status?:string|null;
  raw?:Record<string,unknown>;
}

export function normalizeEmployeePhone(value:string|undefined|null):string{
  let digits=String(value??'').replace(/\D/g,'');
  if((digits.length===12||digits.length===13)&&digits.startsWith('55'))digits=digits.slice(2);
  if(digits.length===0)return'';
  if(digits.length!==10&&digits.length!==11)throw new Error('Telefone deve possuir DDD e 10 ou 11 dígitos.');
  return digits;
}

const explicitJobTitleAliases=['funcao_atual','jobtitle','job_title','ds_funcao','descricao_funcao','nm_funcao','nome_funcao','ds_cargo','descricao_cargo','nm_cargo','nome_cargo','funcao_descricao','cargo_descricao','descricao_cargo_funcao','denominacao_funcao','denominacao_cargo'];

function isLikelyTextTitle(value:unknown):value is string{
  if(value===null||value===undefined)return false;
  const text=String(value).trim();
  if(text.length<3||text.length>190)return false;
  if(/^[-+]?\d+(?:[.,]\d+)?$/.test(text))return false;
  return /[A-Za-zÀ-ÿ]/.test(text);
}

export function inferSageJobTitle(raw:Record<string,unknown>|undefined|null):string|null{
  if(!raw)return null;
  const entries=Object.entries(raw);
  const normalized=new Map(entries.map(([key,value])=>[key.toLowerCase(),value]));
  for(const alias of explicitJobTitleAliases){const value=normalized.get(alias);if(isLikelyTextTitle(value))return String(value).trim();}
  for(const [key,value] of entries){
    const normalizedKey=key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(!/(funcao|cargo)/.test(normalizedKey))continue;
    if(/(codigo|\bcod\b|^cd_|_cd_|cbo|data|^dt_|_dt_|id_|_id|historico)/.test(normalizedKey))continue;
    if(isLikelyTextTitle(value))return String(value).trim();
  }
  const history=raw.historico_funcoes;
  if(Array.isArray(history)){
    for(const item of history){
      if(!item||typeof item!=='object')continue;
      const row=item as Record<string,unknown>;
      for(const alias of ['jobTitle','funcao','descricao','description','cargo']){const value=row[alias];if(isLikelyTextTitle(value))return String(value).trim();}
    }
  }
  return null;
}

export function sageEmployeePatch(employee:SageEmployeeData){
  const canonicalJobTitle=isLikelyTextTitle(employee.jobTitle)?String(employee.jobTitle).trim():null;
  const jobTitle=canonicalJobTitle||inferSageJobTitle(employee.raw)||null;
  return{
    name:String(employee.name),
    birthDate:String(employee.birthDate),
    admissionDate:employee.admissionDate??null,
    jobTitle,
    sageStatus:employee.status??null,
    snapshotJson:JSON.stringify(employee.raw??employee),
  };
}
