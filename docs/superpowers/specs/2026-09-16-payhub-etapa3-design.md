# PayHub — Etapa 3 — Design aprovado

Data: 2026-09-16

## 1. Objetivo

Evoluir o PayHub da atual integração técnica com o Sage para uma plataforma operacional completa de gestão, distribuição, consulta e assinatura eletrônica reforçada de holerites.

A Etapa 3 preserva a arquitetura existente: API Node.js + TypeScript + Express, dashboard React/Vite, MySQL externo `pay_hub`, conector Windows Service .NET 8 somente leitura, PM2 + Nginx e os perfis administrativos MASTER e ANALISTA.

A Etapa 3 acrescenta cadastro de funcionários, grupos, automações, normalização da folha, portal do funcionário, distribuição de holerites e assinatura eletrônica reforçada.

## 2. Regras aprovadas

### 2.1 Empresa Sage

- A empresa utilizada será sempre `1`.
- O campo Empresa permanece visível e bloqueado para edição.

### 2.2 Funcionários

- Apenas funcionários cadastrados no PayHub poderão ter holerites consultados no Sage.
- O cadastro começa pelo CPF.
- Ao informar 11 dígitos, o PayHub consulta o Sage pelo conector .NET.
- O Sage é a fonte de verdade para os dados cadastrais básicos.
- CPF não encontrado no Sage bloqueia o cadastro.
- Ao localizar o funcionário, o PayHub grava o vínculo com `cd_funcionario`.
- Cada funcionário pertence a somente um grupo por vez.
- Mudanças de grupo geram histórico com grupo anterior, grupo novo, data/hora e usuário responsável.

Dados esperados, conforme disponibilidade no Sage: empresa, código/matrícula Sage, nome, CPF, nascimento, admissão, cargo/função, situação funcional, grupo atual, status no PayHub, situação do primeiro acesso e último acesso.

## 3. Autenticação e perfis

Perfis: `MASTER`, `ANALISTA` e `FUNCIONARIO`.

MASTER e ANALISTA continuam no fluxo administrativo atual. Funcionários terão credenciais próprias, sem misturar seus registros na tabela administrativa `users`.

### 3.1 Tela única de login

- login iniciado por letra/e-mail: e-mail + senha de MASTER/ANALISTA;
- login iniciado por número: aplicar máscara `000.000.000-00` e usar CPF + PIN do funcionário.

CPF aceita entrada com ou sem pontuação e é normalizado para 11 dígitos.

### 3.2 Primeiro acesso do funcionário

1. informar CPF;
2. se não houver PIN, solicitar CPF + data de nascimento;
3. validar contra o cadastro importado do Sage;
4. criar PIN numérico de exatamente 6 dígitos;
5. persistir somente o hash do PIN;
6. ativar o acesso;
7. próximos logins usam CPF + PIN.

PIN nunca será armazenado em texto puro.

## 4. Permissões

### MASTER

Pode operar funcionários, grupos, buscas, liberações, links, WhatsApp, usuários ANALISTA, auditoria, segurança, assinatura reforçada, links temporários, integração Sage e automações.

### ANALISTA

Pode executar a operação diária: funcionários, grupos, buscas, forçar busca, liberar holerite, gerar link e enviar via WhatsApp.

Não pode administrar usuários, segurança, parâmetros da assinatura reforçada nem consultar logs completos dos demais analistas.

### FUNCIONÁRIO

Pode acessar apenas o próprio perfil, visualizar somente holerites liberados, filtrar por competência, ver resumo/completo, acompanhar status, assinar, baixar somente após assinatura e consultar relatório/histórico próprios.

## 5. Grupos

- cada funcionário pertence a um único grupo;
- empresa fixa `1`;
- tipos de folha configuráveis por grupo;
- vários horários diários por grupo;
- execução automática apenas de segunda a sexta-feira;
- competência automática sempre mês atual;
- `Buscar holerites agora` respeita os tipos configurados no grupo.

Tipos inicialmente suportados:

- `2` — mensal;
- `3` — adiantamento de 13º;
- `4` — 13º salário;
- `6` — rescisão;
- compatibilidade com rescisão tipo `2` + evento `180` (`LIQUIDO RESCISAO`).

## 6. Automação

Criar processo PM2 separado `payhub-worker`.

Responsabilidades:

- avaliar agendas;
- criar execuções;
- impedir duplicidade;
- criar jobs do conector;
- processar respostas do Sage;
- normalizar dados;
- gerar documentos;
- executar tarefas longas fora da API HTTP.

A persistência/orquestração continuará no MySQL atual, sem Redis nesta etapa.

### 6.1 Execução automática

1. identificar grupo/horário vencido;
2. validar segunda a sexta;
3. usar competência do mês atual;
4. selecionar funcionários ativos do grupo;
5. criar `payroll_run` com origem `SCHEDULED`;
6. criar job para o conector;
7. receber dados brutos;
8. normalizar;
9. criar/atualizar holerites;
10. registrar resultado e erros.

### 6.2 Execução manual

`Buscar holerites agora` usa o mesmo fluxo, com origem `MANUAL` e registro do MASTER/ANALISTA responsável.

### 6.3 Idempotência e falhas

Impedir duplicidade para a mesma combinação de grupo, data, horário, competência e tipos. Reinício do worker não pode duplicar execução.

Falhas parciais devem ser registradas e permitir `Reprocessar somente falhas`.

## 7. Consulta cadastral no Sage

Criar operação específica de conector para CPF, por exemplo `EMPLOYEE_LOOKUP_BY_CPF`.

- empresa sempre `1`;
- consulta parametrizada;
- nunca concatenar CPF em SQL;
- retornar somente dados necessários;
- navegador nunca acessa SQL Server diretamente;
- toda comunicação Sage passa pelo Windows Connector.

Após cadastro, buscas de folha usam o código Sage vinculado ao funcionário.

## 8. Normalização

Fontes prioritárias:

`Funcionario`, `FunDocumento`, `FunFuncional`, `FunSalario`, `ProcEvento`, `EventoGVigencia`, `ProcBase`, `MovCapa`, `MovEvento`.

Resultado normalizado deve conter, conforme aplicável: funcionário, competência, tipo, proventos, descontos, bases, líquido, eventos e dados funcionais necessários ao documento.

## 9. Holerites

Estados principais:

- `PROCESSANDO`;
- `PRONTO`;
- `ASSINATURA_SOLICITADA`;
- `VISUALIZADO`;
- `ASSINADO`.

Estados excepcionais:

- `ERRO`;
- `CANCELADO`;
- `SUBSTITUIDO`.

A importação do Sage não libera automaticamente o holerite. `PRONTO` é somente administrativo. Só após `Liberar para assinatura` o status vira `ASSINATURA_SOLICITADA` e o documento aparece no portal do funcionário.

### 9.1 Versionamento

- calcular SHA-256 do PDF original;
- dados idênticos não criam duplicidade;
- alteração antes da assinatura cria nova versão preservando a anterior;
- documento já assinado nunca é substituído silenciosamente.

## 10. Documentos

Manter:

1. PDF original/canônico;
2. documento final assinado;
3. comprovante de assinatura;
4. hashes correspondentes.

Funcionário só baixa após assinatura. Administrativo pode visualizar antes da liberação.

Arquitetura preparada para bucket S3 privado, evitando dependência do disco do Lightsail.

## 11. Assinatura reforçada

Métodos configuráveis pelo MASTER:

- aceite eletrônico autenticado;
- aceite autenticado + assinatura manuscrita desenhada.

A assinatura desenhada é evidência adicional, não a prova principal.

### 11.1 Autenticação da assinatura

- com PIN já criado: exigir PIN de 6 dígitos;
- sem PIN: CPF + nascimento, validação, criação de PIN e prosseguimento.

### 11.2 Aceite

Exigir aceite explícito por texto versionado e registrar versão, hash/conteúdo e data/hora.

### 11.3 Evidências mínimas

Registrar:

- ID da assinatura;
- funcionário e CPF vinculado;
- matrícula Sage;
- holerite, competência e tipo;
- SHA-256 do PDF original;
- SHA-256 do documento final;
- timestamp UTC;
- timestamp `America/Sao_Paulo`;
- IP público;
- User-Agent;
- sistema/navegador quando identificável;
- sessão;
- origem (`PORTAL`, `PWA`, `ANDROID`, `LINK_TEMPORARIO`);
- link usado, quando aplicável;
- método de autenticação;
- aceite versionado;
- assinatura manuscrita quando exigida;
- resultado.

Nunca registrar PIN puro.

### 11.4 Envelope de evidências

Gerar envelope criptográfico com hashes e dados da assinatura, preparado para:

- assinatura do envelope com chave fora do código/banco;
- AWS KMS como opção de guarda da chave;
- carimbo de tempo confiável;
- cadeia de eventos com hash do evento anterior.

Eventos-base:

`LINK_CREATED` → `LINK_OPENED` → `IDENTITY_VERIFIED` → `DOCUMENT_VIEWED` → `ACCEPTANCE_CONFIRMED` → `SIGNATURE_CREATED` → `DOCUMENT_SEALED`.

## 12. Link temporário e WhatsApp

Cada link:

- é único;
- pertence a um holerite;
- tem expiração configurável pelo MASTER;
- pode ser revogado;
- armazena somente hash do token no banco;
- permite assinatura sem login tradicional, mas exige autenticação aprovada;
- é invalidado para nova assinatura após uso.

Fluxo:

1. validar token, expiração, revogação e uso;
2. identificar funcionário e holerite;
3. se houver PIN, solicitar PIN;
4. sem PIN, executar primeiro acesso e criação do PIN;
5. liberar visualização;
6. exigir aceite;
7. coletar assinatura manuscrita se configurada;
8. gerar assinatura reforçada;
9. invalidar link para nova assinatura.

WhatsApp inicialmente será `gerar link + abrir mensagem/conversa pronta`. Integração oficial poderá vir depois sem alterar o modelo.

## 13. Portal do funcionário

Mobile-first para PWA e futura camada Android.

Seções:

- Início;
- Meus holerites;
- Relatório;
- Meu acesso;
- Sair.

Exibir apenas documentos liberados. Permitir filtro por mês/ano, resumo, visualização completa, assinatura e download somente após assinatura.

## 14. Dashboard administrativo

Cards/indicadores mínimos:

- funcionários ativos;
- grupos ativos;
- holerites encontrados no mês;
- aguardando liberação;
- assinatura solicitada;
- assinados;
- pendentes;
- falhas de importação;
- status do conector Sage;
- próxima busca automática;
- atividades recentes.

## 15. Funcionários

Listagem com busca/filtros por nome, CPF, matrícula Sage, grupo, status e situação de acesso.

Perfil individual com abas:

- Visão geral;
- Holerites;
- Assinaturas;
- Histórico;
- Acesso.

Ações:

- visualizar resumo;
- visualizar completo;
- liberar para assinatura;
- gerar link temporário;
- enviar via WhatsApp;
- ver evidências;
- download quando permitido.

## 16. Central de holerites

Tela operacional separada da integração técnica Sage.

Filtros: competência, grupo, funcionário, tipo, status e situação de assinatura.

Ações em massa: liberar para assinatura, gerar links e exportar relatório.

`Integração Sage` permanece como tela de diagnóstico técnico.

## 17. Configurações

Seções:

- Usuários administrativos;
- Auditoria e logs;
- Assinaturas;
- Links temporários;
- Integração Sage;
- Automação;
- Segurança.

## 18. Auditoria

Registrar ações relevantes de MASTER/ANALISTA: funcionário, troca de grupo, busca, reprocessamento, liberação, geração/revogação de link, visualização/download administrativo, mudanças de configuração e criação de analista.

Campos típicos: ator, ação, data/hora, IP, User-Agent, alvo, resultado e metadados mínimos necessários.

CPF e nascimento não devem aparecer integralmente em logs comuns.

## 19. Modelo de dados proposto

Entidades principais:

- `employees`;
- `employee_credentials`;
- `employee_sessions`;
- `employee_groups`;
- `group_schedules`;
- `group_history`;
- `payroll_runs`;
- `payrolls`;
- `payroll_items`;
- `payroll_documents`;
- `signature_requests`;
- `signature_links`;
- `signature_evidence`;
- `signature_events`;
- `document_access_logs`.

Migrations compatíveis com MySQL 5.6.

## 20. UI/UX

Revisão ampla da experiência atual:

- sidebar profissional;
- header enxuto;
- cards operacionais;
- badges consistentes;
- skeleton loading;
- busca instantânea;
- filtros persistentes;
- drawers/modais;
- feedback claro de operações longas;
- progresso de importação;
- responsividade desktop/tablet/celular;
- portal do funcionário mobile-first.

## 21. Segurança

- preservar sessão administrativa atual;
- CSRF onde aplicável;
- rate limit específico CPF/PIN;
- bloqueio temporário após tentativas inválidas;
- sessões de funcionário revogáveis e com expiração;
- PIN somente como hash;
- token de link somente como hash;
- Sage somente leitura;
- consultas SQL parametrizadas;
- documentos/evidências protegidos contra sobrescrita silenciosa;
- downloads administrativos auditados;
- minimização de dados pessoais nos logs.

## 22. Fluxo final

```text
SAGE
  ↓
Connector .NET 8
  ↓
PayHub Raw Data
  ↓
Normalização
  ↓
Holerite
  ↓
PDF + SHA-256
  ↓
Revisão administrativa
  ↓
Assinatura solicitada
  ↓
Portal / WhatsApp
  ↓
CPF + PIN
  ↓
Aceite + assinatura
  ↓
Envelope de evidências
  ↓
Documento assinado
  ↓
Auditoria permanente
```

## 23. Critérios de sucesso

A Etapa 3 estará funcionalmente concluída quando for possível:

1. cadastrar funcionário exclusivamente por CPF existente no Sage;
2. associá-lo a um único grupo;
3. configurar tipos e vários horários por grupo;
4. buscar automaticamente de segunda a sexta no mês atual;
5. forçar busca manual;
6. normalizar folha em holerites;
7. revisar e liberar documentos;
8. autenticar funcionário por CPF + PIN de 6 dígitos;
9. realizar primeiro acesso por CPF + nascimento;
10. mostrar apenas holerites liberados;
11. bloquear download antes da assinatura;
12. assinar por portal ou link temporário;
13. exigir/criar PIN conforme o caso;
14. coletar aceite e assinatura desenhada quando configurada;
15. gerar pacote de evidências robusto;
16. auditar ações administrativas;
17. reprocessar somente falhas;
18. preservar versões e assinaturas anteriores;
19. operar com UX consistente em desktop, PWA e futura camada Android.

## 24. Fora do escopo imediato

- API oficial do WhatsApp;
- assinatura ICP-Brasil do funcionário;
- múltiplas empresas Sage;
- funcionário em múltiplos grupos;
- Redis/BullMQ;
- qualquer escrita no banco Sage.

Esses pontos poderão evoluir posteriormente sem quebrar o modelo aprovado nesta etapa.
