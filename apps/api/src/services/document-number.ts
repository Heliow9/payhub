import { randomBytes } from 'node:crypto';

const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomPart(length:number):string{
  const bytes=randomBytes(length);
  let out='';
  for(let i=0;i<length;i++) out+=alphabet[bytes[i]!%alphabet.length];
  return out;
}

export function createDocumentNumber(year:number,month:number):string{
  return `PH-${year}${String(month).padStart(2,'0')}-${randomPart(4)}-${randomPart(4)}-${randomPart(4)}`;
}

export function normalizeDocumentNumber(value:string):string{
  return value.trim().toUpperCase().replace(/\s+/g,'');
}

export function isDocumentNumber(value:string):boolean{
  return /^PH-\d{6}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/.test(normalizeDocumentNumber(value))
    || /^PH-\d{6}-(?:[0-9A-F]{12}|[0-9A-F]{16})$/.test(normalizeDocumentNumber(value));
}
