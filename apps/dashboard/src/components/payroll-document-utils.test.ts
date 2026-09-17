import { describe, expect, it } from 'vitest';
import { natureLabel, sortPayrollItems } from './payroll-document-utils';

describe('apresentação do holerite',()=>{
  it('traduz natureza para português',()=>{
    expect(natureLabel('EARNING')).toBe('VENCIMENTOS');
    expect(natureLabel('DEDUCTION')).toBe('DESCONTOS');
  });
  it('segue a ordem visual do holerite Sage: vencimentos e depois descontos, por código',()=>{
    const items=[
      {eventCode:'76',nature:'DEDUCTION'},
      {eventCode:'369',nature:'EARNING'},
      {eventCode:'18',nature:'EARNING'},
      {eventCode:'80',nature:'DEDUCTION'},
      {eventCode:'1',nature:'EARNING'}
    ];
    expect(sortPayrollItems(items).map((i)=>i.eventCode)).toEqual(['1','18','369','76','80']);
  });
});
