function pdfEscape(value:string):string{return value.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,' ');}
function latin(value:string):string{return value.normalize('NFC').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/–|—/g,'-').replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g,'?');}
function numberBr(value:number|null|undefined):string{return value==null?'—':new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);}
function eventCode(code:string):string{const raw=String(code??'').trim();return /^\d+$/.test(raw)&&raw.length<5?raw.padStart(5,'0'):raw;}
function monthLabel(competence:string):string{const match=/^(\d{1,2})\/(\d{4})$/.exec(competence);if(!match)return competence;const names=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];return `${names[Math.max(0,Math.min(11,Number(match[1])-1))]}/${match[2]}`;}
function fmtDate(value:string|null|undefined):string{if(!value)return'—';const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(value);return match?`${match[3]}/${match[2]}/${match[1]}`:value;}
function amount(item:{amount:number;nature:string},nature:string):string{return String(item.nature).toUpperCase()===nature?numberBr(item.amount):'';}

export interface PdfPayrollInput{
  title?:string;
  employeeName:string;
  cpfMasked:string;
  sageCode:string;
  competence:string;
  typeLabel:string;
  jobTitle?:string|null;
  admissionDate?:string|null;
  cbo?:string|null;
  companyName?:string;
  companyAddress?:string;
  companyDocument?:string;
  companyUnit?:string;
  gross:number|null;
  deductions:number|null;
  net:number|null;
  salaryBase?:number|null;
  inssBase?:number|null;
  fgtsBase?:number|null;
  fgtsMonth?:number|null;
  irrfBase?:number|null;
  irrfBracket?:number|null;
  items:Array<{code:string;description:string;reference?:string|null;amount:number;nature:string}>;
  footer?:string[];
  signatureInfo?:{signedAt:string;acceptanceText:string};
}

type PdfObject=Buffer;
function text(x:number,y:number,value:string,size=7,bold=false):string{return `BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(latin(value))}) Tj ET`;}
function textRight(x:number,y:number,value:string,size=7,bold=false):string{const width=latin(value).length*size*.49;return text(x-width,y,value,size,bold);}
function textCenter(x:number,y:number,w:number,value:string,size=7,bold=false):string{const width=latin(value).length*size*.49;return text(x+(w-width)/2,y,value,size,bold);}
function rotatedText(x:number,y:number,value:string,size=6,bold=false):string{return `BT /${bold?'F2':'F1'} ${size} Tf 0 1 -1 0 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(latin(value))}) Tj ET`;}
function rotatedFitText(x:number,y:number,maxLength:number,value:string,size=4,bold=false):string{const safe=latin(value);const natural=Math.max(1,safe.length*size*.49);const scale=Math.max(28,Math.min(100,(maxLength/natural)*100));return `BT /${bold?'F2':'F1'} ${size} Tf ${scale.toFixed(2)} Tz 0 1 -1 0 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(safe)}) Tj ET`;}

function line(x1:number,y1:number,x2:number,y2:number,width=.45):string{return `${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`;}
function rect(x:number,y:number,w:number,h:number,width=.55):string{return `${width} w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`;}
function fit(value:string,max:number):string{const s=latin(value.trim());return s.length<=max?s:s.slice(0,Math.max(1,max-1))+'…';}

function drawReceipt(input:PdfPayrollInput,y0:number):string[]{
  const c:string[]=[];const x0=14;const right=581;const signatureLeft=531;const mainRight=signatureLeft;const h=370;const top=y0+h;
  const companyName=input.companyName??'REAL ENERGY LTDA';const companyAddress=input.companyAddress??'RUA BEIRA CANAL, 49';const companyDocument=input.companyDocument??'41.116.138/0001-38 OLINDA PE';const companyUnit=input.companyUnit??'REAL ENERGY - PE';
  const jobTitle=(input.jobTitle??'—').toUpperCase();const employee=input.employeeName.toUpperCase();
  const headerBottom=top-60;const empBottom=headerBottom-44;const tableHeadBottom=empBottom-15;const basesTop=y0+34;const totalsTop=y0+90;const bodyBottom=totalsTop;
  c.push(rect(x0,y0,right-x0,h));c.push(line(signatureLeft,y0,signatureLeft,top));
  c.push(text(x0+4,top-11,companyName,8,true),text(x0+4,top-22,companyAddress,7),text(x0+4,top-33,companyDocument,7),text(x0+4,top-44,`${companyName} / ${companyAddress.replace(', ',',')}`,7));
  c.push(textRight(mainRight-8,top-12,'Recibo de Pagamento de Salário',10,true),textRight(mainRight-8,top-27,`Mês: ${monthLabel(input.competence)}`,8));
  c.push(line(x0,headerBottom,mainRight,headerBottom));
  c.push(text(x0+15,headerBottom-9,'Código',5.5),text(x0+15,headerBottom-20,eventCode(input.sageCode),7));
  c.push(text(x0+54,headerBottom-9,'Nome do Funcionário',5.5),text(x0+54,headerBottom-20,fit(employee,50),7),text(x0+54,headerBottom-33,fit(jobTitle,45),7));
  c.push(text(x0+334,headerBottom-9,'CBO',5.5),text(x0+334,headerBottom-20,input.cbo??'—',6.5));
  c.push(text(x0+365,headerBottom-9,'Emp.',5.5),text(x0+366,headerBottom-20,'001',6.5));
  c.push(text(x0+392,headerBottom-9,'Local',5.5),text(x0+393,headerBottom-20,'001',6.5));
  c.push(text(x0+423,headerBottom-9,'Depto.',5.5),text(x0+425,headerBottom-20,'001',6.5));
  c.push(text(x0+458,headerBottom-9,'Setor',5.5),text(x0+459,headerBottom-20,'000',6.5));
  c.push(text(x0+489,headerBottom-9,'Seção',5.5),text(x0+490,headerBottom-20,'000',6.5));
  c.push(text(x0+334,headerBottom-34,`Admissão: ${fmtDate(input.admissionDate)}`,6.5),text(x0+424,headerBottom-34,fit(companyUnit,18),6.5));
  c.push(line(x0,empBottom,mainRight,empBottom));
  const xCode=x0+38,xDesc=x0+313,xRef=x0+373,xVenc=x0+443;
  c.push(line(xCode,empBottom,xCode,bodyBottom),line(xDesc,empBottom,xDesc,bodyBottom),line(xRef,empBottom,xRef,bodyBottom),line(xVenc,empBottom,xVenc,bodyBottom));
  c.push(textCenter(x0,empBottom-10,xCode-x0,'Cód.',5.5),textCenter(xCode,empBottom-10,xDesc-xCode,'Descrição',5.5),textCenter(xDesc,empBottom-10,xRef-xDesc,'Referência',5.5),textCenter(xRef,empBottom-10,xVenc-xRef,'Vencimentos',5.5),textCenter(xVenc,empBottom-10,mainRight-xVenc,'Descontos',5.5));
  c.push(line(x0,tableHeadBottom,mainRight,tableHeadBottom));
  const items=input.items.slice(0,12);const available=Math.max(72,tableHeadBottom-bodyBottom-8);const rowStep=Math.min(13.5,Math.max(8.6,available/Math.max(items.length,1)));const rowFont=rowStep<10?5.6:6.6;let y=tableHeadBottom-rowStep;
  for(const item of items){c.push(text(x0+4,y,eventCode(item.code),rowFont),text(xCode+4,y,fit(item.description,rowStep<10?49:45),rowFont),textCenter(xDesc,y,xRef-xDesc,item.reference??'—',rowFont),textRight(xVenc-7,y,amount(item,'EARNING'),rowFont+.2),textRight(mainRight-7,y,amount(item,'DEDUCTION'),rowFont+.2));y-=rowStep;}
  if(!input.signatureInfo&&input.footer?.length){const note=fit(input.footer.join(' | '),135);c.push(text(xCode+4,bodyBottom+4,note,4.6));}
  c.push(line(x0,totalsTop,mainRight,totalsTop));c.push(line(xDesc,totalsTop,xDesc,basesTop));c.push(line(xVenc,totalsTop,xVenc,basesTop));
  c.push(textCenter(xDesc,totalsTop-11,xVenc-xDesc,'Total de Vencimentos',5.3),textCenter(xVenc,totalsTop-11,mainRight-xVenc,'Total de Descontos',5.3));
  c.push(textRight(xVenc-8,totalsTop-26,numberBr(input.gross),8),textRight(mainRight-8,totalsTop-26,numberBr(input.deductions),8));
  c.push(line(xDesc,totalsTop-34,mainRight,totalsTop-34));c.push(text(xDesc+4,totalsTop-49,'Valor Líquido',5.5),textRight(mainRight-8,totalsTop-49,numberBr(input.net),8,true));
  c.push(line(x0,basesTop,mainRight,basesTop));
  const baseW=(mainRight-x0)/6;const baseLabels=['Salário Base','Sal. Contr. INSS','Base Cálc. FGTS','FGTS do mês','Base Cálc. IRRF','Faixa IRRF'];const baseValues=[input.salaryBase,input.inssBase,input.fgtsBase,input.fgtsMonth,input.irrfBase,input.irrfBracket];
  for(let i=0;i<6;i++){const bx=x0+i*baseW;c.push(textCenter(bx,y0+21,baseW,baseLabels[i]!,5.0),textCenter(bx,y0+8,baseW,numberBr(baseValues[i]),7.2));}
  if(input.signatureInfo){
    const sideLength=h-18;
    c.push(rotatedFitText(signatureLeft+10,y0+9,sideLength,'DECLARO TER RECEBIDO A IMPORTÂNCIA LÍQUIDA DISCRIMINADA NESTE RECIBO',4.6,true));
    c.push(rotatedFitText(signatureLeft+22,y0+9,sideLength,`Assinado eletronicamente em ${input.signatureInfo.signedAt}.`,4.2,true));
    c.push(rotatedFitText(signatureLeft+34,y0+9,sideLength,input.signatureInfo.acceptanceText,3.6,false));
  }else{
    c.push(rotatedText(signatureLeft+15,y0+20,'DECLARO TER RECEBIDO A IMPORTÂNCIA LÍQUIDA DISCRIMINADA NESTE RECIBO',5.4));
    c.push(line(signatureLeft+31,y0+96,right-6,y0+96),rotatedText(signatureLeft+42,y0+105,'ASSINATURA DO FUNCIONÁRIO',6.2,true));
    c.push(line(signatureLeft+31,y0+24,right-6,y0+24),rotatedText(signatureLeft+42,y0+30,'DATA',6));
  }
  return c;
}

function buildPdfFromPageCommands(pages:string[][]):Buffer{
  const objects:PdfObject[]=[];const add=(content:string|Buffer)=>{objects.push(Buffer.isBuffer(content)?content:Buffer.from(content,'latin1'));return objects.length;};
  const catalogId=add('');const pagesId=add('');const fontId=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');const boldId=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');const pageIds:number[]=[];
  for(const commands of pages){const stream=Buffer.from(commands.join('\n'),'latin1');const streamId=add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`,'latin1'),stream,Buffer.from('\nendstream','latin1')]));const pageId=add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${streamId} 0 R >>`);pageIds.push(pageId);}
  objects[catalogId-1]=Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`,'latin1');objects[pagesId-1]=Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id)=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,'latin1');
  const chunks:Buffer[]=[Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1')];const offsets:number[]=[0];let offset=chunks[0]!.length;objects.forEach((obj,index)=>{offsets.push(offset);const head=Buffer.from(`${index+1} 0 obj\n`,'latin1');const tail=Buffer.from('\nendobj\n','latin1');chunks.push(head,obj,tail);offset+=head.length+obj.length+tail.length;});const xrefOffset=offset;let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)xref+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;xref+=`trailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;chunks.push(Buffer.from(xref,'latin1'));return Buffer.concat(chunks);
}

export function buildPayrollPdf(input:PdfPayrollInput):Buffer{return buildPdfFromPageCommands([[...drawReceipt(input,445),...drawReceipt(input,25)]]);}

function wrap(text:string,max=92):string[]{const words=text.split(/\s+/);const lines:string[]=[];let current='';for(const word of words){if(!word)continue;const next=current?`${current} ${word}`:word;if(next.length>max&&current){lines.push(current);current=word;}else current=next;}if(current)lines.push(current);return lines;}
export function buildTextPdf(allLines:string[]):Buffer{const pages:string[][]=[];for(let i=0;i<allLines.length;i+=48)pages.push(allLines.slice(i,i+48));if(pages.length===0)pages.push(['']);return buildPdfFromPageCommands(pages.map((pageLines)=>{const commands=['BT','/F1 10 Tf','46 795 Td'];pageLines.forEach((raw,index)=>{const lineValue=latin(raw);if(index>0)commands.push('0 -15 Td');commands.push(`(${pdfEscape(lineValue)}) Tj`);});commands.push('ET');return commands;}));}
