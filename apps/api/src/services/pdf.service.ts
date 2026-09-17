function pdfEscape(value:string):string{return value.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,' ');}
function money(value:number|null|undefined):string{return value==null?'—':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);}

interface PdfPayrollInput{
  title?:string; employeeName:string; cpfMasked:string; sageCode:string; competence:string; typeLabel:string;
  gross:number|null; deductions:number|null; net:number|null;
  items:Array<{code:string;description:string;reference?:string|null;amount:number;nature:string}>;
  footer?:string[];
}

function wrap(text:string,max=92):string[]{const words=text.split(/\s+/);const lines:string[]=[];let current='';for(const word of words){if(!word)continue;const next=current?`${current} ${word}`:word;if(next.length>max&&current){lines.push(current);current=word;}else current=next;}if(current)lines.push(current);return lines;}

export function buildPayrollPdf(input:PdfPayrollInput):Buffer{
  const lines:string[]=[];
  lines.push(input.title??'PayHub - Holerite');lines.push('');
  lines.push(`Funcionario: ${input.employeeName}`);
  lines.push(`CPF: ${input.cpfMasked}   Matricula Sage: ${input.sageCode}`);
  lines.push(`Competencia: ${input.competence}   Tipo: ${input.typeLabel}`);lines.push('');
  lines.push('Eventos');lines.push('Codigo  Descricao                                                       Valor');
  lines.push('------  --------------------------------------------------------------  -------------');
  for(const item of input.items){
    const desc=item.description.length>62?item.description.slice(0,59)+'...':item.description;
    lines.push(`${item.code.padEnd(6)}  ${desc.padEnd(62)}  ${money(item.amount).padStart(13)}`);
  }
  lines.push('');lines.push(`Total de proventos: ${money(input.gross)}`);lines.push(`Total de descontos: ${money(input.deductions)}`);lines.push(`Liquido: ${money(input.net)}`);
  if(input.footer?.length){lines.push('');for(const raw of input.footer)for(const line of wrap(raw))lines.push(line);}
  return buildTextPdf(lines);
}

export function buildTextPdf(allLines:string[]):Buffer{
  const pages:string[][]=[];for(let i=0;i<allLines.length;i+=48)pages.push(allLines.slice(i,i+48));if(pages.length===0)pages.push(['']);
  const objects:Buffer[]=[];
  const add=(content:string|Buffer)=>{objects.push(Buffer.isBuffer(content)?content:Buffer.from(content,'latin1'));return objects.length;};
  const catalogId=add('');const pagesId=add('');const fontId=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds:number[]=[];
  for(const pageLines of pages){
    const streamLines=['BT','/F1 10 Tf','46 795 Td'];
    pageLines.forEach((line,index)=>{if(index>0)streamLines.push('0 -15 Td');streamLines.push(`(${pdfEscape(line)}) Tj`);});streamLines.push('ET');
    const stream=Buffer.from(streamLines.join('\n'),'latin1');const streamId=add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`,'latin1'),stream,Buffer.from('\nendstream','latin1')]));
    const pageId=add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`);pageIds.push(pageId);
  }
  objects[catalogId-1]=Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`,'latin1');
  objects[pagesId-1]=Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id)=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,'latin1');
  const chunks:Buffer[]=[Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1')];const offsets:number[]=[0];let offset=chunks[0]!.length;
  objects.forEach((obj,index)=>{offsets.push(offset);const head=Buffer.from(`${index+1} 0 obj\n`,'latin1');const tail=Buffer.from('\nendobj\n','latin1');chunks.push(head,obj,tail);offset+=head.length+obj.length+tail.length;});
  const xrefOffset=offset;let xref=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<offsets.length;i++)xref+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  xref+=`trailer\n<< /Size ${objects.length+1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;chunks.push(Buffer.from(xref,'latin1'));return Buffer.concat(chunks);
}
