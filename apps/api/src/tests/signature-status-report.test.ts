import { describe,expect,it } from 'vitest';
import { PayrollService } from '../services/payroll.service.js';

const context={kind:'USER' as const,companyId:1,userId:7,role:'ANALISTA' as const};

describe('relatório consolidado de assinaturas',()=>{
  it('consulta uma linha por funcionário pelo holerite corrente mais recente no tenant',async()=>{
    let captured:{sql:string;params:unknown[]}|undefined;
    const pool={execute:async(sql:string,params:unknown[])=>{captured={sql,params};return[[{employeeId:8,employeeName:'Maria',cpf:'52998224725',birthDate:'1990-05-20',costCenter:'Operações',year:2026,month:9,payrollTypeLabel:'Mensal',status:'SIGNED',signedAt:'2026-10-10 14:20:00'}]];}};
    const service=new PayrollService(pool as never,{} as never,{} as never,{} as never);

    const rows=await service.signatureStatusReport(context,{status:'SIGNED',groupId:9,year:2026,month:9} as any);

    expect(rows).toEqual([expect.objectContaining({employeeId:8,employeeName:'Maria',status:'SIGNED'})]);
    expect(captured?.sql).toContain('p.company_id=?');
    expect(captured?.sql).toContain('e.group_id=?');
    expect(captured?.sql).toContain('p.year=?');
    expect(captured?.sql).toContain('p.month=?');
    expect(captured?.sql).toContain('NOT EXISTS');
    expect(captured?.sql).toContain('newer.is_current=1');
    expect(captured?.sql.indexOf("p.status IN")).toBeLessThan(captured?.sql.indexOf('NOT EXISTS')??-1);
    expect(captured?.params).toEqual([1,2026,9,9,'SIGNED']);
  });

  it('limita pendentes aos estados liberados e visualizados',async()=>{
    let params:unknown[]=[];
    const pool={execute:async(_sql:string,input:unknown[])=>{params=input;return[[]];}};
    const service=new PayrollService(pool as never,{} as never,{} as never,{} as never);
    await service.signatureStatusReport(context,{status:'PENDING',year:2026,month:9} as any);
    expect(params).toEqual([1,2026,9,'SIGNATURE_REQUESTED','VIEWED']);
  });
});
