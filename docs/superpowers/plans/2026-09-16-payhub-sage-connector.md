# PayHub Sage Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a Etapa 2 do PayHub com fila de jobs, autenticação de conector e Windows Service .NET 8 para leitura somente leitura do Sage e envio de snapshots brutos à API.

**Architecture:** A API Node/TypeScript mantém conectores, jobs e lotes brutos no MySQL 5.6. Um Windows Service .NET 8 instalado na rede do Sage faz polling HTTPS, executa consultas somente leitura no SQL Server e envia resultados em lotes JSON.

**Tech Stack:** Node.js 22, TypeScript, Express, MySQL 5.6, React/Vite, .NET 8 Worker Service, Microsoft.Data.SqlClient.

**Spec:** `docs/superpowers/specs/2026-09-16-payhub-sage-connector-design.md`

## Global Constraints

- SQL Server `Sage_Gestao_Contabil` é externo ao Lightsail e somente leitura.
- Não expor SQL Server na internet.
- API pública em `https://paayhubapi.duckdns.org`.
- Banco do PayHub: MySQL 5.6 `pay_hub` externo.
- Dashboard existente não pode perder autenticação, sessão ou gestão de usuários.
- Token do conector é persistido apenas como SHA-256.
- Tipos de folha: 2, 3, 4, 6; tipo 2 com evento 180 representa rescisão na normalização posterior.

---

### Task 1: Persistência do conector e fila

**Files:**
- Create: `apps/api/src/infra/db/migrations/002_sage_connector.sql`
- Create: `apps/api/src/domain/connectors/connector.repository.ts`
- Create: `apps/api/src/domain/connectors/import-job.repository.ts`
- Create: `apps/api/src/infra/repositories/mysql/mysql-connector.repository.ts`
- Create: `apps/api/src/infra/repositories/mysql/mysql-import-job.repository.ts`

**Interfaces:**
- Produces: CRUD de conectores, claim de jobs, progresso, logs e batches.

- [ ] Escrever testes de domínio/repositório em memória para token e transições de job.
- [ ] Executar os testes e confirmar falha inicial.
- [ ] Implementar interfaces e repositórios.
- [ ] Executar testes até ficarem verdes.

### Task 2: Serviços e autenticação do agente

**Files:**
- Create: `apps/api/src/domain/connectors/connector.service.ts`
- Create: `apps/api/src/http/middleware/connector-auth.ts`
- Create: `apps/api/src/http/routes/connectors.routes.ts`
- Create: `apps/api/src/http/routes/import-jobs.routes.ts`
- Create: `apps/api/src/http/routes/connector-agent.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Produces: endpoints administrativos e endpoints autenticados do agente.

- [ ] Escrever testes HTTP para criação do conector, criação de job e heartbeat/claim.
- [ ] Confirmar falha inicial.
- [ ] Implementar rotas e serviços.
- [ ] Confirmar testes verdes.

### Task 3: Dashboard Integração Sage

**Files:**
- Modify: `apps/dashboard/src/api/client.ts`
- Create: `apps/dashboard/src/pages/SageIntegrationPage.tsx`
- Modify: `apps/dashboard/src/pages/DashboardPage.tsx`
- Modify: `apps/dashboard/src/styles.css`

**Interfaces:**
- Consumes: `/api/connectors` e `/api/import-jobs`.
- Produces: cadastro de conector, token de uso único e fila/progresso de jobs.

- [ ] Escrever teste de navegação/visibilidade da seção.
- [ ] Confirmar falha inicial.
- [ ] Implementar UI.
- [ ] Confirmar teste verde.

### Task 4: Windows Service .NET 8

**Files:**
- Create: `connector/PayHub.SageConnector/PayHub.SageConnector.csproj`
- Create: `connector/PayHub.SageConnector/Program.cs`
- Create: `connector/PayHub.SageConnector/ConnectorOptions.cs`
- Create: `connector/PayHub.SageConnector/PayHubApiClient.cs`
- Create: `connector/PayHub.SageConnector/SageReadOnlyClient.cs`
- Create: `connector/PayHub.SageConnector/Worker.cs`
- Create: `connector/PayHub.SageConnector/appsettings.example.json`
- Create: `connector/README.md`

**Interfaces:**
- Consumes: SQL Server Sage e endpoints `/api/connector-agent/*`.
- Produces: heartbeat, claim, progresso, logs, snapshots JSON e conclusão/falha.

- [ ] Implementar cliente SQL com whitelist de tabelas e queries parametrizadas.
- [ ] Implementar API client e polling.
- [ ] Implementar execução dos três tipos de job.
- [ ] Documentar publicação e instalação como Windows Service.

### Task 5: Verificação e documentação de deploy

**Files:**
- Modify: `README.md`
- Modify: `apps/api/src/http/routes/dashboard.routes.ts`

- [ ] Atualizar o módulo `sage_connector` para ativo.
- [ ] Rodar `npm test`.
- [ ] Rodar `npm run build`.
- [ ] Rodar `dotnet build connector/PayHub.SageConnector/PayHub.SageConnector.csproj` em ambiente com .NET 8.
- [ ] Aplicar migration `002_sage_connector.sql` antes do restart da API.
