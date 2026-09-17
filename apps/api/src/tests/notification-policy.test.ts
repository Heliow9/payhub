import { describe,expect,it } from 'vitest';
import { defaultPushCategories, notificationPayload } from '../services/notification-policy.js';

describe('notification policy',()=>{
  it('usa categorias diferentes para funcionário e usuário administrativo',()=>{
    expect(defaultPushCategories({kind:'EMPLOYEE'})).toEqual(expect.arrayContaining(['PAYROLL_AVAILABLE','SIGNATURE_COMPLETED']));
    expect(defaultPushCategories({kind:'USER',role:'MASTER'})).toEqual(expect.arrayContaining(['IMPORT_COMPLETED','IMPORT_FAILED','CONNECTOR_OFFLINE']));
    expect(defaultPushCategories({kind:'USER',role:'ANALISTA'})).not.toContain('SECURITY');
  });
  it('limita payload de push e mantém URL interna segura',()=>{
    const p=notificationPayload({title:'A'.repeat(300),body:'B'.repeat(1000),url:'https://evil.example/x',category:'SYSTEM'});
    expect(p.title.length).toBeLessThanOrEqual(120);
    expect(p.body.length).toBeLessThanOrEqual(300);
    expect(p.url).toBe('/');
  });
});
