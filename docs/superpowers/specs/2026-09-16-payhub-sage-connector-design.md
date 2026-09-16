# PayHub — Etapa 2 Conector Sage (.NET 8)

## Objetivo

Adicionar ao PayHub a camada de integração entre o ambiente externo do Sage e a API pública do PayHub, mantendo o SQL Server `Sage_Gestao_Contabil` fora da internet e em acesso somente leitura.

## Arquitetura

O conector será um Windows Service .NET 8 instalado no servidor Windows que possui conectividade com o SQL Server do Sage. Ele fará apenas conexões de saída: SQL Server local/rede interna para leitura e HTTPS para `https://paayhubapi.duckdns.org`.

A API Node.js armazenará estado do conector, fila de jobs, progresso, logs e lotes brutos no MySQL `pay_hub`. Nenhuma credencial do SQL Server será enviada ao PayHub.

## Segurança

- SQL Server: acesso somente leitura.
- Nenhuma porta do SQL Server será exposta na internet.
- Cada conector possui um token opaco de 256 bits, retornado apenas no momento do cadastro.
- Apenas o hash SHA-256 do token é persistido no PayHub.
- O agente envia `X-PayHub-Connector-Id` e `Authorization: Bearer <token>`.
- O dashboard continua usando sessão HttpOnly + CSRF.
- Criação de conector é exclusiva do perfil `MASTER`.
- Criação e acompanhamento de jobs é permitida a `MASTER` e `ANALISTA` autenticados.

## Fontes Sage

Tabelas priorizadas para a integração:

- `Funcionario`
- `FunDocumento`
- `FunFuncional`
- `FunSalario`
- `ProcEvento`
- `EventoGVigencia`
- `ProcBase`
- `MovCapa`
- `MovEvento`

Chave funcional principal já identificada: `cd_empresa + cd_funcionario`.

Campos já confirmados no legado:

- `ProcEvento`: `cd_empresa`, `cd_funcionario`, `ano`, `mes`, `tipo`, `cd_evento`, `referencia`, `referencia_editada`, `valor`.
- `ProcBase`: `vl_base_inss`, `vl_base_fgts`, `vl_base_irrf`, `dt_pagamento`.
- `FunSalario`: `vl_salario`.
- `EventoGVigencia`: `tp_evento` com valores `V`, `D`, `N`.

Para evitar acoplamento a variações de schema do Sage, a Etapa 2 envia snapshots brutos em JSON. A normalização para entidades definitivas do PayHub pertence à Etapa 3.

## Tipos de folha

- `2`: mensal.
- `3`: adiantamento do 13º.
- `4`: 13º.
- `6`: rescisão.
- `2` contendo o evento `180` (`LIQUIDO RESCISAO`) também deve ser tratado como rescisão na normalização posterior.

## Jobs

Tipos suportados nesta etapa:

1. `CONNECTION_TEST` — testa SQL Server e retorna versão/banco atual.
2. `SCHEMA_DISCOVERY` — lista colunas e contagem das tabelas Sage permitidas.
3. `PAYROLL_IMPORT` — coleta snapshots brutos das tabelas permitidas, aplicando filtros somente quando as colunas existem.

Escopo de `PAYROLL_IMPORT`:

```json
{
  "companyCode": 1,
  "employeeCode": 123,
  "year": 2026,
  "month": 9,
  "types": [2, 3, 4, 6],
  "fromAdmission": false
}
```

`employeeCode`, `year`, `month` e `types` são opcionais. Isso permite importar um funcionário, uma competência específica ou um conjunto mais amplo. Histórico desde a admissão será representado por `fromAdmission=true`; o detalhamento cronológico será tratado na Etapa 3.

## Ciclo do job

`QUEUED → RUNNING → COMPLETED | FAILED | CANCELLED`

O conector consulta a fila, reivindica o job mais antigo disponível, executa, envia progresso e logs e encerra o job. Jobs reivindicados ficam associados ao conector responsável. Se um job ficar 10 minutos sem progresso por perda do conector, ele é reenfileirado automaticamente; após 3 tentativas ele é marcado como `FAILED`.

## Persistência no MySQL

Novas tabelas:

- `connectors`
- `import_jobs`
- `connector_job_logs`
- `connector_raw_batches`

Os lotes brutos são idempotentes por `job_id + source_table + batch_number`.

## Dashboard

Nova seção `Integração Sage`:

- lista conectores e último heartbeat;
- permite ao Master cadastrar um conector e copiar o token uma única vez;
- permite criar job de teste de conexão, descoberta de schema ou importação bruta;
- mostra status, progresso e mensagem atual dos jobs.

## Fora do escopo desta etapa

- transformar snapshots em funcionários/holerites definitivos;
- gerar PDF final;
- disponibilizar holerite ao funcionário;
- solicitar ou colher assinatura;
- PWA/APK do funcionário.

Esses itens permanecem para as etapas seguintes. A regra de negócio já aprovada continua: o funcionário só poderá assinar depois que o dashboard solicitar a assinatura e o holerite passar para `Assinatura solicitada`.
