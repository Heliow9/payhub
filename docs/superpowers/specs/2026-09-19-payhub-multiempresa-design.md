# PayHub Multiempresa — Especificação de Arquitetura

**Data:** 2026-09-19  
**Status:** Aprovado para planejamento  
**Escopo:** Transformar o PayHub atual em uma aplicação multiempresa, preservando integralmente a operação e os dados existentes da RealEnergy.

## 1. Objetivo

O PayHub atualmente opera como uma aplicação monoempresa. A empresa Sage é fixada como `1`, usuários administrativos não carregam contexto empresarial e as consultas de dados não possuem isolamento por empresa.

Esta mudança deve introduzir isolamento multiempresa em autenticação, autorização, dados, conectores, filas, workers, configurações, auditoria e notificações sem recriar ou perder os registros existentes da RealEnergy.

O resultado esperado é:

- RealEnergy continua operando com seu MASTER, usuários, funcionários, grupos, conector, holerites, assinaturas e documentos atuais;
- usuários administrativos pertencem a uma única empresa e usam e-mail globalmente único;
- cada empresa possui exatamente um MASTER ativo e pode possuir vários ANALISTAS;
- funcionários possuem identidade global por CPF e um único PIN;
- um funcionário pode possuir vínculos com várias empresas;
- quando houver vários vínculos acessíveis, o funcionário escolhe a empresa após autenticar CPF e PIN;
- vínculos encerrados continuam permitindo acesso histórico aos documentos;
- toda operação da API ocorre dentro de uma empresa selecionada e validada pela sessão;
- o PayHub fica preparado para provisionamento futuro pelo Ponto Certo SaaS, sem depender dele nesta fase.

## 2. Decisões arquiteturais

### 2.1 Modelo escolhido

Será usada uma base compartilhada com isolamento lógico obrigatório por `company_id`.

Esse modelo foi escolhido porque:

- preserva o banco e os IDs atuais;
- permite um login global por CPF;
- permite ao funcionário alternar entre empresas;
- simplifica migrações, backups e operação;
- é compatível com o provisionamento de produtos já existente no Ponto Certo SaaS;
- evita o custo operacional de um banco por cliente.

### 2.2 Identificadores distintos

`company_id` é o identificador interno e imutável de uma empresa no PayHub.

`sage_company_code` é um parâmetro da integração daquela empresa. O código Sage `1` será associado à RealEnergy e não será usado como identificador do tenant.

### 2.3 Contexto obrigatório

Toda sessão autenticada deve estar vinculada a exatamente uma empresa. O contexto empresarial é obtido da sessão e nunca de um `companyId` livre fornecido pelo frontend.

Consultas por identificador devem combinar o ID do recurso com o `company_id` autenticado. Um recurso existente em outra empresa deve ser respondido como não encontrado.

## 3. Modelo de dados

### 3.1 Empresas

Criar `companies` com, no mínimo:

```text
id
legal_name
display_name
slug
status
sage_company_code
external_source
external_id
created_at
updated_at
```

`slug` deve ser único. O par `external_source` e `external_id` será opcional nesta fase e servirá ao provisionamento futuro.

### 3.2 Usuários administrativos

Usuários administrativos continuam na tabela `users`, acrescida de `company_id`.

```text
users
- id
- company_id
- name
- email
- password_hash
- role: MASTER | ANALISTA
- status: ACTIVE | DISABLED
- created_at
- updated_at
```

Regras:

- `email` permanece único globalmente;
- cada usuário pertence a exatamente uma empresa;
- o login administrativo não possui seletor de empresa;
- um e-mail existente não pode ser cadastrado em outra empresa;
- o MASTER só administra ANALISTAS da própria empresa.

Criar `company_masters`:

```text
company_id PRIMARY KEY
user_id UNIQUE
created_at
updated_at
```

Essa tabela materializa o único MASTER da empresa. Não será permitido desativar ou excluir o MASTER atual. Uma substituição deverá promover o novo MASTER e alterar o vínculo em uma única transação.

### 3.3 Identidade global do funcionário

Criar `employee_identities`:

```text
id
cpf UNIQUE
birth_date
pin_hash
activated_at
pin_changed_at
failed_attempts
locked_until
last_login_at
created_at
updated_at
```

O CPF e o PIN pertencem à identidade, não ao vínculo empresarial.

A tabela `employees` passa a representar o vínculo com uma empresa:

```text
id
company_id
identity_id
sage_employee_code
cpf
name
birth_date
admission_date
job_title
phone
sage_status
group_id
status
sage_snapshot_json
created_by_user_id
created_at
updated_at
```

O campo `cpf` atual será mantido durante a transição para compatibilidade. A identidade será a fonte canônica de autenticação.

Restrições:

- `employee_identities.cpf` é único globalmente;
- `(company_id, identity_id)` é único;
- `(company_id, sage_employee_code)` é único;
- o nome de grupo é único dentro da empresa, não globalmente.

Quando uma nova empresa cadastrar um CPF já conhecido, será criado apenas um novo vínculo. O PIN existente será reutilizado. Data de nascimento e criação de PIN não serão solicitadas novamente.

Se os dados de nascimento forem divergentes, o vínculo não será unido silenciosamente. A inconsistência deverá ser registrada e encaminhada para análise administrativa.

### 3.4 Configurações e raízes empresariais

Configurações hoje globais passam a ser registradas por empresa, incluindo:

- modo de assinatura;
- validade de links;
- texto de aceite;
- preferências de notificação;
- código da empresa no Sage;
- futuros parâmetros de marca e documento.

As seguintes tabelas ou suas substitutas devem receber `company_id` diretamente:

- `users`;
- `sessions`;
- `audit_logs`;
- `connectors`;
- `import_jobs`;
- `connector_job_logs`;
- `connector_raw_batches`;
- `employee_groups`;
- `employees`;
- `employee_sessions`;
- `payroll_runs`;
- `schedule_executions`;
- `payrolls`;
- configurações da aplicação;
- notificações;
- preferências de notificação;
- inscrições push.

Tabelas-filhas continuam ligadas ao pai por chave estrangeira, mas consultas e mutações devem validar a cadeia de pertencimento empresarial.

## 4. Autenticação e sessões

### 4.1 Login administrativo

O administrador informa e-mail e senha. Como o e-mail é globalmente único, a conta determina a empresa e a API cria diretamente uma sessão empresarial.

Exemplo de principal:

```ts
{
  kind: "USER",
  userId: 1,
  companyId: 1,
  role: "MASTER",
  email: "admin@realenergy.com.br"
}
```

O login existente do MASTER da RealEnergy deve continuar funcionando sem alteração de credenciais ou seletor.

### 4.2 Login do funcionário

O funcionário informa CPF e PIN. A API autentica `employee_identities` e carrega os vínculos acessíveis.

- um vínculo acessível: cria diretamente a sessão;
- vários vínculos acessíveis: retorna token temporário e lista de empresas;
- nenhum vínculo acessível: recusa o acesso.

Estados:

- `ACTIVE`: acesso completo;
- `TERMINATED`: acesso histórico;
- `DISABLED`: sem acesso e fora do seletor.

### 4.3 Seleção de empresa

O token de seleção deve:

- ser aleatório;
- ser persistido apenas como hash;
- ter validade curta, inicialmente cinco minutos;
- ser de uso único;
- não autorizar outras rotas;
- conter ou referenciar a identidade autenticada.

`POST /api/auth/select-company` recebe o token e a empresa escolhida. A API consulta novamente o vínculo antes de emitir a sessão definitiva.

Exemplo de principal do funcionário:

```ts
{
  kind: "EMPLOYEE",
  identityId: 20,
  employeeId: 45,
  companyId: 1,
  employmentStatus: "TERMINATED",
  accessMode: "HISTORICAL"
}
```

### 4.4 Troca de empresa

O portal oferece “Trocar empresa” quando há mais de um vínculo acessível. A API confirma que o vínculo de destino pertence à mesma identidade, revoga a sessão atual e emite uma nova sessão no contexto escolhido.

### 4.5 Primeiro acesso

A data de nascimento só é exigida quando a identidade global ainda não possui PIN.

Após criar o PIN global, a API aplica o mesmo fluxo de um ou vários vínculos. Se um PIN já existe, a inclusão de uma nova empresa não repete primeiro acesso, data de nascimento ou confirmação cadastral.

### 4.6 Acesso histórico

No modo `HISTORICAL`, o funcionário pode:

- consultar holerites anteriormente liberados;
- consultar e baixar documentos assinados;
- acessar evidências das próprias assinaturas;
- trocar de empresa;
- atualizar o PIN global.

Não pode:

- receber novos holerites naquele vínculo;
- assinar novas solicitações;
- reativar o vínculo;
- executar primeiro acesso novamente;
- acessar funções administrativas.

### 4.7 Web e mobile

Continuam suportados:

- cookie `HttpOnly` e CSRF no painel/PWA;
- Bearer token no aplicativo mobile;
- restauração pelo `/api/auth/me`;
- revogação no logout.

Web/PWA e mobile devem implementar o mesmo seletor de empresa.

## 5. Autorização e isolamento

A camada HTTP deve montar um contexto autenticado:

```ts
type RequestContext = {
  companyId: number;
  principal:
    | { kind: "USER"; userId: number; role: "MASTER" | "ANALISTA" }
    | {
        kind: "EMPLOYEE";
        identityId: number;
        employeeId: number;
        accessMode: "FULL" | "HISTORICAL";
      };
};
```

Serviços devem receber esse contexto em vez de apenas IDs soltos. Listagens, detalhes, alterações e exclusões devem sempre filtrar a empresa.

O isolamento abrange:

- dashboard;
- usuários;
- funcionários;
- grupos e agendas;
- holerites e documentos;
- solicitações e evidências de assinatura;
- conectores e importações;
- configurações;
- notificações;
- auditoria;
- downloads e exportações.

Links públicos resolvem a empresa pela cadeia `link → solicitação → holerite → funcionário → empresa`. O cliente não escolhe a empresa do link.

## 6. Conector, fila e normalização

Cada conector pertence a uma empresa PayHub. Um conector só pode reivindicar jobs de seu próprio `company_id`.

O escopo do job continua contendo `companyCode`, mas esse valor é obtido da configuração da empresa:

```json
{
  "payhubCompanyId": 1,
  "companyCode": "1",
  "employeeCodes": ["100", "101"],
  "year": 2026,
  "month": 9
}
```

Antes de persistir uma importação, a normalização confirma que:

```text
empresa do job
= empresa do conector
= empresa do grupo ou funcionário
= empresa do holerite de destino
```

Divergências devem falhar antes da gravação e gerar auditoria operacional.

O conector existente da RealEnergy será associado à empresa criada na migração e continuará usando `companyCode = "1"`.

## 7. Worker, notificações e auditoria

O worker deve:

- normalizar jobs dentro da empresa do job;
- executar agendas no contexto da empresa do grupo;
- criar execuções e payroll runs com `company_id`;
- detectar conectores offline por empresa;
- calcular pendências separadamente;
- enviar alertas somente aos administradores da empresa correta;
- isolar falhas para que uma empresa não interrompa as demais.

Auditoria e notificações recebem `company_id`. Usuários só podem consultar registros de sua empresa.

## 8. Interface

### 8.1 Administração

Para a RealEnergy, o comportamento funcional permanece igual. O painel passa a exibir o nome da empresa autenticada. Textos fixos como “Empresa 1” devem usar o nome empresarial; o código Sage aparece apenas na integração.

Não há seletor administrativo.

### 8.2 Funcionário

Se houver um vínculo, o login segue direto. Com vários vínculos, a tela mostra nome, estado e modo de acesso de cada empresa.

O nome da empresa selecionada deve permanecer visível no portal para evitar confusão entre documentos de empregadores diferentes.

## 9. Provisionamento futuro

O PayHub continuará independente do Ponto Certo SaaS nesta etapa.

Deve existir um serviço interno transacional equivalente a:

```ts
provisionCompany({
  legalName,
  displayName,
  slug,
  sageCompanyCode,
  master: { name, email, password },
  externalSource?,
  externalId?,
  idempotencyKey?
});
```

O serviço valida o e-mail global, cria empresa, MASTER único e configurações padrão e registra auditoria. Na primeira fase, será acionado apenas por processo técnico.

No futuro, o Ponto Certo SaaS poderá cadastrar o produto `PAYHUB`, chamar uma API privada idempotente e armazenar o `companyId` retornado como `external_account_id`, seguindo o padrão já usado pelo provisionamento externo de produtos. Os bancos não serão compartilhados.

## 10. Migração da RealEnergy

A migração será aditiva e preservará IDs.

Etapas:

1. Criar tabelas e colunas novas inicialmente opcionais.
2. Criar a empresa RealEnergy com `sage_company_code = "1"`.
3. Preencher `company_id` em todos os registros legados.
4. Associar todos os usuários administrativos à RealEnergy.
5. Registrar `admin@realenergy.com.br` como MASTER.
6. Criar uma identidade global por CPF existente.
7. Copiar PIN, ativação, tentativas, bloqueios e último acesso.
8. Associar os funcionários às identidades.
9. Copiar configurações globais para configurações da RealEnergy.
10. Associar conectores, jobs, grupos, execuções, notificações e auditorias.
11. Validar contagens, vínculos, registros órfãos e hashes documentais.
12. Publicar a API compatível.
13. Tornar `company_id` obrigatório e aplicar índices definitivos.

Não serão recriados funcionários, holerites, PDFs, evidências, assinaturas, solicitações, logs ou jobs históricos.

Os caminhos dos arquivos existentes permanecem inalterados. Novos documentos poderão usar `companies/<companyId>/...`.

Sessões existentes poderão ser invalidadas durante a implantação. Isso exige novo login, mas não altera PINs ou senhas.

## 11. Erros e invariantes

- e-mail administrativo duplicado: recusar;
- segundo MASTER na mesma empresa: recusar;
- desativação do MASTER atual sem substituição: recusar;
- CPF existente: criar apenas novo vínculo;
- divergência de nascimento: registrar conflito e interromper associação automática;
- empresa não vinculada à identidade: recusar seleção;
- token expirado ou reutilizado: exigir novo login;
- recurso de outra empresa: responder como não encontrado;
- conector e job de empresas diferentes: recusar e auditar;
- resultado Sage divergente: interromper normalização;
- vínculo histórico tentando nova assinatura: recusar;
- falha de worker em uma empresa: registrar e continuar as demais.

## 12. Implantação e reversibilidade

1. Fazer e verificar backup do banco e armazenamento.
2. Ensaiar a migração em cópia do banco real.
3. Aplicar estruturas aditivas.
4. Executar backfill da RealEnergy.
5. Gerar relatório antes/depois.
6. Publicar API, painel e aplicativo compatíveis.
7. Ativar isolamento obrigatório.
8. Criar uma segunda empresa de homologação.
9. Executar testes cruzados.
10. Aplicar restrições finais.

Estruturas antigas não serão removidas na primeira entrega. Isso mantém uma janela de rollback do código enquanto o esquema novo permanece compatível.

## 13. Estratégia de testes

### 13.1 Regressão da RealEnergy

Validar o fluxo completo:

```text
login MASTER
→ gestão de analistas
→ consulta e cadastro de funcionários
→ grupos e agendas
→ conector Sage
→ importação
→ liberação
→ login do funcionário
→ assinatura
→ download
→ evidências
→ notificações
→ auditoria
```

### 13.2 Isolamento

- MASTER e ANALISTA da empresa A não veem recursos da empresa B;
- IDs da empresa B usados sob sessão A retornam não encontrado;
- configurações e notificações não atravessam empresas;
- conector A não reivindica job B;
- worker mantém contexto correto;
- links públicos resolvem a empresa pela cadeia persistida.

### 13.3 Identidade e login

- o mesmo CPF usa um PIN em duas empresas;
- um vínculo entra direto;
- vários vínculos exibem seletor;
- vínculo encerrado oferece acesso histórico;
- vínculo desabilitado não oferece acesso;
- troca de empresa revoga o contexto anterior;
- novo vínculo de identidade já ativada não repete primeiro acesso;
- e-mail administrativo duplicado é recusado;
- segundo MASTER é recusado.

### 13.4 Migração

Comparar antes e depois:

- usuários;
- funcionários;
- credenciais com PIN;
- grupos;
- holerites por status;
- documentos;
- solicitações e evidências;
- conectores e jobs;
- notificações e auditorias;
- registros sem empresa;
- registros órfãos;
- hashes dos PDFs.

## 14. Critérios de aceite

A entrega só será aceita quando:

1. A RealEnergy completar todos os fluxos atuais sem perda de dados ou alteração de credenciais.
2. Os hashes dos documentos legados permanecerem inalterados.
3. Uma segunda empresa de homologação executar o fluxo completo.
4. Nenhum endpoint permitir leitura ou mutação cruzada entre empresas.
5. Um funcionário com o mesmo CPF acessar duas empresas usando um único PIN.
6. Um vínculo encerrado acessar apenas documentos históricos permitidos.
7. E-mails administrativos continuarem globalmente únicos.
8. Cada empresa mantiver exatamente um MASTER ativo.
9. Conectores, jobs, workers, configurações, notificações e auditorias estiverem isolados por empresa.
10. O serviço interno de provisionamento estiver pronto para futura integração, sem criar dependência atual do Ponto Certo SaaS.
