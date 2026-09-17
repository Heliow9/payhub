import {describe,expect,it} from 'vitest';
import {isValidPhoneBr,phoneDigitsBr,phoneMaskBr} from './phone-utils';

describe('telefone brasileiro',()=>{
  it('formata celular com DDD',()=>{expect(phoneMaskBr('81994262615')).toBe('(81) 99426-2615');expect(phoneDigitsBr('+55 (81) 99426-2615')).toBe('81994262615');});
  it('formata telefone fixo com DDD',()=>{expect(phoneMaskBr('8134211234')).toBe('(81) 3421-1234');});
  it('valida somente 10 ou 11 dígitos nacionais',()=>{expect(isValidPhoneBr('(81) 99426-2615')).toBe(true);expect(isValidPhoneBr('123')).toBe(false);});
});
