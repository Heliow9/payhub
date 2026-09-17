import {describe,expect,it} from 'vitest';
import {normalizeEmployeePhone,sageEmployeePatch} from '../services/employee-data.js';

describe('employee data helpers',()=>{
  it('normaliza telefone brasileiro',()=>{expect(normalizeEmployeePhone('+55 (81) 99426-2615')).toBe('81994262615');expect(normalizeEmployeePhone('')).toBe('');expect(()=>normalizeEmployeePhone('123')).toThrow(/DDD/);});
  it('monta patch Sage sem alterar telefone PayHub',()=>{expect(sageEmployeePatch({name:'HELIO',birthDate:'1980-01-01',admissionDate:'2018-09-03',jobTitle:'TECNICO INFORMATICA',status:'DEMITIDO',raw:{salario_atual:2783.42}})).toEqual({name:'HELIO',birthDate:'1980-01-01',admissionDate:'2018-09-03',jobTitle:'TECNICO INFORMATICA',sageStatus:'DEMITIDO',snapshotJson:'{"salario_atual":2783.42}'});});
});
