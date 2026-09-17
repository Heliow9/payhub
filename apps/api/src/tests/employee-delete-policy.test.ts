import { describe,expect,it } from 'vitest';
import { employeeDeletionBlockReason } from '../services/employee-delete-policy.js';

describe('employee deletion policy',()=>{
  it('bloqueia quando existe qualquer holerite assinado',()=>{
    expect(employeeDeletionBlockReason(['READY','SIGNED','REPLACED'])).toContain('assinado');
  });
  it('permite exclusão quando não existe holerite assinado',()=>{
    expect(employeeDeletionBlockReason(['READY','SIGNATURE_REQUESTED','ERROR','REPLACED'])).toBeNull();
  });
});
