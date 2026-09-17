export type ProfileField={label:string;value:string};
export type EmployeeProfile={personal:ProfileField[];documents:ProfileField[];functional:ProfileField[];compensation:ProfileField[]};

type Snapshot=Record<string,unknown>|null|undefined;

function mapSnapshot(snapshot:Snapshot):Map<string,unknown>{return new Map(Object.entries(snapshot??{}).map(([k,v])=>[k.toLowerCase(),v]));}
export function profileValue(snapshot:Snapshot,aliases:string[]):string|null{const map=mapSnapshot(snapshot);for(const alias of aliases){const value=map.get(alias.toLowerCase());if(value!==undefined&&value!==null&&String(value).trim()!=='')return String(value).trim();}return null;}
function dateBr(value:string|null):string|null{if(!value)return null;const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(value);if(match)return`${match[3]}/${match[2]}/${match[1]}`;const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleDateString('pt-BR');}
function moneyBr(value:string|null):string|null{if(!value)return null;const raw=value.trim();const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const n=Number(normalized);if(!Number.isFinite(n))return value;return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function add(target:ProfileField[],label:string,value:string|null){if(value)target.push({label,value});}
function joinParts(parts:Array<string|null>,separator=' · '):string|null{const clean=parts.filter((v):v is string=>Boolean(v));return clean.length?clean.join(separator):null;}

export function buildEmployeeProfile(snapshot:Snapshot):EmployeeProfile{
  const personal:ProfileField[]=[];const documents:ProfileField[]=[];const functional:ProfileField[]=[];const compensation:ProfileField[]=[];
  const v=(...aliases:string[])=>profileValue(snapshot,aliases);

  add(personal,'Nome social',v('nome_social','nm_social','nome_social_funcionario'));
  add(personal,'Sexo',v('ds_sexo','descricao_sexo','sexo','tp_sexo'));
  add(personal,'Estado civil',v('ds_estado_civil','descricao_estado_civil','nm_estado_civil','estado_civil','civil','cd_estado_civil'));
  add(personal,'Escolaridade',v('ds_instrucao','descricao_instrucao','nm_instrucao','escolaridade','grau_instrucao','instrucao','cd_instrucao'));
  add(personal,'Celular',v('nr_celular','celular','telefone_celular','fone_celular'));
  add(personal,'Telefone',v('telefone','nr_telefone','fone'));
  add(personal,'E-mail',v('email','e_mail','ds_email'));
  const street=joinParts([v('ds_endereco','nm_endereco','endereco','logradouro','rua'),v('nr_endereco','numero')],', ');
  const locality=joinParts([v('ds_bairro','nm_bairro','bairro'),v('nm_municipio','ds_municipio','cidade','municipio'),v('sg_uf','uf')],' · ');
  const address=joinParts([street,locality],' · ');
  add(personal,'Endereço',address);
  add(personal,'CEP',v('cep','nr_cep'));

  add(documents,'PIS/PASEP',v('nr_pis','pis','pis_pasep','nr_pasep','pasep'));
  const ctps=joinParts([v('nr_ctps','ctps','numero_ctps'),v('serie_ctps','serie_carteira'),v('uf_ctps','uf_carteira')]);
  add(documents,'CTPS',ctps);
  const rg=joinParts([v('nr_rg','rg','identidade','numero_rg'),v('orgao_emissor_rg','orgao_emissor','ds_orgao_emissor'),v('uf_rg')]);
  add(documents,'RG',rg);
  add(documents,'Emissão RG',dateBr(v('dt_emissao_rg','data_emissao_rg')));
  add(documents,'Título de eleitor',v('titulo_eleitor','nr_titulo_eleitor','numero_titulo'));
  add(documents,'Zona / Seção',joinParts([v('zona_eleitoral','zona'),v('secao_eleitoral','secao')],' / '));
  add(documents,'CNH',v('nr_cnh','cnh','numero_cnh'));

  add(functional,'CBO',v('cbo','cd_cbo','nr_cbo','codigo_cbo','cbo_funcao','cd_cbo_funcao'));
  add(functional,'Função',v('ds_funcao','descricao_funcao','nm_funcao','ds_cargo','descricao_cargo','nm_cargo','funcao','cargo'));
  add(functional,'Departamento / Lotação',v('ds_lotacao','nm_lotacao','ds_departamento','nm_departamento','lotacao','departamento'));
  add(functional,'Admissão',dateBr(v('dt_admissao','data_admissao','admissao')));
  add(functional,'Demissão',dateBr(v('dt_demissao','data_demissao','demissao')));
  add(functional,'Situação',v('situacao','status','ds_situacao','st_funcionario'));
  add(functional,'Jornada',v('ds_jornada','ds_horario','regime_jornada','jornada','horario'));
  const hours=v('horas_semanais','qt_horas_semanais','jornada_semanal');add(functional,'Horas semanais',hours?`${hours} h`:null);
  add(functional,'Empresa / Unidade',v('nm_empresa','ds_empresa','nm_local','ds_local','unidade','local','empresa'));

  add(compensation,'Salário atual',moneyBr(v('salario','vl_salario','salario_atual','valor_salario')));
  add(compensation,'Tipo de salário',v('tipo_salario','regime_salario','tp_salario'));
  add(compensation,'Adiantamento',v('percentual_adiantamento','pc_adiantamento','adiantamento'));
  add(compensation,'Banco',v('banco','nm_banco','cd_banco'));
  add(compensation,'Agência / Conta',joinParts([v('agencia','nr_agencia'),v('conta','nr_conta')],' / '));

  return{personal,documents,functional,compensation};
}
