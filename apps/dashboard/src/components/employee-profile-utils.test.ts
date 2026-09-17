import { describe,expect,it } from 'vitest';
import { buildEmployeeProfile, profileValue } from './employee-profile-utils';

describe('employee Sage profile',()=>{
  it('normaliza dados funcionais, documentos e remuneração a partir do snapshot Sage',()=>{
    const profile=buildEmployeeProfile({
      nr_pis:'140.84641.51-7',nr_ctps:'30855',serie_ctps:'00094',uf_ctps:'PE',
      nr_rg:'8955862',dt_emissao_rg:'2013-05-04',uf_rg:'PE',orgao_emissor_rg:'SDS',
      endereco:'Rua Duarte Coelho',numero:'349',bairro:'Santa Tereza',cidade:'Olinda',uf:'PE',cep:'53010010',nr_celular:'81994262615',
      sexo:'M',estado_civil:'2',instrucao:'7',cd_cbo:'313205',salario:'2783.42',horas_semanais:'44',regime_jornada:'MENSALISTA',departamento:'REAL ENERGY - PE',dt_demissao:'2026-01-30'
    });
    expect(profile.documents.find((x)=>x.label==='PIS/PASEP')?.value).toBe('140.84641.51-7');
    expect(profile.documents.find((x)=>x.label==='CTPS')?.value).toContain('30855');
    expect(profile.personal.find((x)=>x.label==='Endereço')?.value).toContain('Rua Duarte Coelho');
    expect(profile.functional.find((x)=>x.label==='CBO')?.value).toBe('313205');
    expect(profile.compensation.find((x)=>x.label==='Salário atual')?.value).toContain('2.783,42');
    expect(profile.functional.find((x)=>x.label==='Demissão')?.value).toBe('30/01/2026');
  });
  it('retorna somente campos existentes e encontra aliases sem diferenciar maiúsculas',()=>{
    const profile=buildEmployeeProfile({NR_CELULAR:'81999998888'});
    expect(profile.personal).toEqual([{label:'Celular',value:'81999998888'}]);
    expect(profile.documents).toEqual([]);
    expect(profileValue({Cd_CbO:'313205'},['cd_cbo'])).toBe('313205');
  });
});
