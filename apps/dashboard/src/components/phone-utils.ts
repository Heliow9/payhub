export function phoneDigitsBr(value:string):string{
  let digits=String(value??'').replace(/\D/g,'');
  if((digits.length===12||digits.length===13)&&digits.startsWith('55'))digits=digits.slice(2);
  return digits.slice(0,11);
}

export function phoneMaskBr(value:string):string{
  const d=phoneDigitsBr(value);
  if(d.length<=2)return d.length?`(${d}`:'';
  const ddd=d.slice(0,2);
  const number=d.slice(2);
  if(number.length<=4)return`(${ddd}) ${number}`;
  if(number.length<=8)return`(${ddd}) ${number.slice(0,4)}-${number.slice(4)}`;
  return`(${ddd}) ${number.slice(0,5)}-${number.slice(5,9)}`;
}

export function isValidPhoneBr(value:string):boolean{
  const d=phoneDigitsBr(value);
  return d.length===10||d.length===11;
}
