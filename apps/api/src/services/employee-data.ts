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

export function sageEmployeePatch(employee:SageEmployeeData){
  return{
    name:String(employee.name),
    birthDate:String(employee.birthDate),
    admissionDate:employee.admissionDate??null,
    jobTitle:employee.jobTitle??null,
    sageStatus:employee.status??null,
    snapshotJson:JSON.stringify(employee.raw??employee),
  };
}
