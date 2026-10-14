import { describe, expect, it } from 'vitest';
import { GroupService } from '../services/group.service.js';
import { EmployeeService } from '../services/employee.service.js';
import { PayrollService } from '../services/payroll.service.js';
import { SignatureService } from '../services/signature.service.js';

const context={kind:'USER' as const,companyId:1,userId:7,role:'MASTER' as const};

describe('isolamento de grupos e funcionários',()=>{
  it('grupo de outra empresa responde como não encontrado',async()=>{
    const pool={query:async(sql:string,params:unknown[])=>{expect(sql).toContain('g.company_id=?');expect(params).toEqual([1]);return[[]];}};
    await expect(new GroupService(pool as never,{} as never).get(context,200)).rejects.toMatchObject({statusCode:404});
  });

  it('detalhe de funcionário filtra simultaneamente id e empresa',async()=>{
    const pool={execute:async(sql:string,params:unknown[])=>{expect(sql).toContain('e.company_id=?');expect(params).toEqual([200,1]);return[[]];}};
    await expect(new EmployeeService(pool as never,{} as never,{} as never,{} as never).detail(context,200)).rejects.toMatchObject({statusCode:404});
  });

  it('CPF com PIN existente cria somente novo vínculo e preserva o PIN global',async()=>{
    const sqlLog:string[]=[];
    const connection={beginTransaction:async()=>undefined,commit:async()=>undefined,rollback:async()=>undefined,release:()=>undefined,execute:async(sql:string)=>{sqlLog.push(sql);if(sql.includes('INSERT INTO employee_identities'))return[{insertId:10}];if(sql.includes('FROM employee_identities'))return[[{birthDate:'1990-05-20'}]];if(sql.includes('INSERT INTO employees'))return[{insertId:44}];return[{affectedRows:1}];}};
    const pool={execute:async(sql:string)=>{if(sql.includes('FROM employee_groups'))return[[{id:3,companyCode:'2'}]];return[[]];},getConnection:async()=>connection};
    const connector={getJob:async()=>({jobType:'EMPLOYEE_LOOKUP_BY_CPF',status:'COMPLETED'}),rawRows:async()=>[{sageEmployeeCode:'900',name:'Maria',cpf:'52998224725',birthDate:'1990-05-20'}]};
    const service=new EmployeeService(pool as never,connector as never,{record:async()=>undefined} as never,{} as never);
    await expect(service.createFromLookup(context,5,3,undefined,{ipAddress:null,userAgent:null})).resolves.toBe(44);
    expect(sqlLog.join('\n')).not.toMatch(/UPDATE employee_identities SET pin_hash|employee_credentials/i);
  });

  it('reinicia o PIN global e revoga todas as sessões da identidade',async()=>{
    const calls:Array<{sql:string;params:unknown[]}>=[];
    const connection={
      beginTransaction:async()=>undefined,commit:async()=>undefined,rollback:async()=>undefined,release:()=>undefined,
      execute:async(sql:string,params:unknown[])=>{
        calls.push({sql,params});
        if(sql.includes('FROM employees e'))return[[{identityId:55,name:'Maria da Silva',cpf:'52998224725'}]];
        return[{affectedRows:1}];
      }
    };
    const auditCalls:any[]=[];
    const service=new EmployeeService({getConnection:async()=>connection} as never,{} as never,{record:async(input:any)=>{auditCalls.push(input);}} as never,{} as never);

    await service.resetPin(context,200,{ipAddress:'127.0.0.1',userAgent:'vitest'});

    expect(calls[0]?.sql).toContain('e.company_id=?');
    expect(calls[0]?.params).toEqual([200,1]);
    expect(calls.some((call)=>call.sql.includes('pin_hash=NULL')&&call.sql.includes('failed_attempts=0')&&call.params[0]===55)).toBe(true);
    expect(calls.some((call)=>call.sql.includes('UPDATE employee_sessions')&&call.sql.includes('identity_id=?')&&call.params[0]===55)).toBe(true);
    expect(auditCalls).toEqual([expect.objectContaining({companyId:1,actorUserId:7,action:'EMPLOYEE_PIN_RESET',targetType:'EMPLOYEE',targetId:200,metadata:expect.objectContaining({cpfLast4:'4725'})})]);
  });

  it('não reinicia PIN de funcionário de outra empresa',async()=>{
    const writes:string[]=[];
    const connection={beginTransaction:async()=>undefined,commit:async()=>undefined,rollback:async()=>undefined,release:()=>undefined,execute:async(sql:string)=>{if(sql.includes('UPDATE '))writes.push(sql);return[[]];}};
    const service=new EmployeeService({getConnection:async()=>connection} as never,{} as never,{record:async()=>undefined} as never,{} as never);
    await expect(service.resetPin(context,999,{ipAddress:null,userAgent:null})).rejects.toMatchObject({statusCode:404});
    expect(writes).toEqual([]);
  });
});

describe('isolamento de holerites e acesso histórico',()=>{
  it('exportação trata ID de outra empresa como não encontrado',async()=>{
    const pool={execute:async(sql:string,params:unknown[])=>{expect(sql).toContain('p.company_id=?');expect(params[0]).toBe(1);return[[]];}};
    const service=new PayrollService(pool as never,{} as never,{} as never,{} as never);
    await expect(service.exportDocuments(context,[200],{ipAddress:null,userAgent:null})).rejects.toMatchObject({statusCode:404});
  });

  it('vínculo histórico não pode assinar um holerite pendente',async()=>{
    const historical={kind:'EMPLOYEE' as const,companyId:1,employeeId:8,identityId:10,accessMode:'HISTORICAL' as const};
    const service=new SignatureService({} as never,{} as never,{} as never,{} as never,{} as never,{} as never);
    await expect(service.signFromPortal(historical,99,'123456',undefined,'PWA',{ipAddress:null,userAgent:null}))
      .rejects.toMatchObject({statusCode:403,code:'HISTORICAL_ACCESS_ONLY'});
  });
});
