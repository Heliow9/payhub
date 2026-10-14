# Reset de PIN e Relatório de Assinaturas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que MASTER e ANALISTA reiniciem o PIN de um funcionário e gerem um PDF consolidado do estado de assinatura dos holerites.

**Architecture:** O reset atua na identidade global, revoga todas as sessões dessa identidade e registra auditoria. O relatório consulta somente o holerite corrente mais recente de cada funcionário no tenant, aplica estado e Centro de Custo no momento da geração e entrega um PDF paginado.

**Tech Stack:** TypeScript, Express, MySQL, React, Vitest e gerador PDF interno.

**Spec:** Requisitos aprovados nesta conversa em 14/10/2026.

## Global Constraints

- MASTER e ANALISTA podem executar as duas operações, sempre limitados à empresa selecionada.
- Resetar o PIN não define um PIN administrativo; o funcionário cria outro no próximo login.
- O reset revoga todas as sessões da identidade compartilhada entre empresas.
- O relatório chama grupo de “Centro de Custo” e contém uma linha por funcionário.
- O holerite mais recente é definido por ano, mês e id entre os registros correntes; READY e ERROR não entram no relatório.
- Alterações locais em `.gitignore`, `.vscode/`, `apps/mobile/app.json` e `apps/mobile/eas.json` não entram no commit.

## Review Focus

- Funcionário de outra empresa deve retornar 404 no reset.
- Falha transacional não pode deixar PIN e sessões em estados divergentes.
- Holerite READY mais novo não pode fazer a consulta recuar para um SIGNED antigo.
- BOTH deve separar assinados e pendentes sem duplicar funcionário.
- Relatório vazio ainda deve produzir PDF válido com os filtros informados.

---

### Task 1: Reset administrativo do PIN

**Files:**
- Modify: `apps/api/src/services/employee.service.ts`
- Modify: `apps/api/src/routes/employees.routes.ts`
- Modify: `apps/api/src/tests/resource-tenancy.test.ts`
- Modify: `apps/dashboard/src/api/client.ts`
- Modify: `apps/dashboard/src/pages/EmployeesPage.tsx`

**Interfaces:**
- Produces: `EmployeeService.resetPin(context, employeeId, meta): Promise<void>` e `api.resetEmployeePin(id)`.

- [ ] Escrever testes de tenant, limpeza da identidade, revogação de sessões e auditoria.
- [ ] Executar os testes e confirmar falha pela ausência do método.
- [ ] Implementar serviço e rota `POST /api/employees/:id/reset-pin` com CSRF.
- [ ] Adicionar confirmação e retorno visual ao perfil do funcionário.
- [ ] Executar testes e build afetados.

### Task 2: Consulta consolidada de assinaturas

**Files:**
- Modify: `apps/api/src/services/payroll.service.ts`
- Create: `apps/api/src/tests/signature-status-report.test.ts`

**Interfaces:**
- Produces: `PayrollService.signatureStatusReport(context, filters)` com estados `SIGNED`, `PENDING` ou `BOTH`.

- [ ] Escrever testes para tenant, Centro de Custo, estados válidos e seleção do holerite corrente mais recente.
- [ ] Executar e confirmar a falha inicial.
- [ ] Implementar consulta compatível com MySQL usando `NOT EXISTS` e ordenação estável.
- [ ] Executar os testes até passarem.

### Task 3: PDF e endpoint do relatório

**Files:**
- Modify: `apps/api/src/services/pdf.service.ts`
- Modify: `apps/api/src/routes/payrolls.routes.ts`
- Modify: `apps/api/src/tests/pdf.test.ts`

**Interfaces:**
- Produces: `buildSignatureStatusReportPdf(input): Buffer` e `GET /api/payrolls/report/signatures.pdf`.

- [ ] Escrever teste de conteúdo, seções e PDF vazio.
- [ ] Executar e confirmar a falha inicial.
- [ ] Implementar PDF paginado com nome, CPF, nascimento, Centro de Custo, competência/tipo, estado e data da assinatura.
- [ ] Implementar validação dos filtros e resposta para download.
- [ ] Executar os testes até passarem.

### Task 4: Modal de geração no dashboard

**Files:**
- Modify: `apps/dashboard/src/api/client.ts`
- Modify: `apps/dashboard/src/pages/PayrollsPage.tsx`

**Interfaces:**
- Consumes: `GET /api/payrolls/report/signatures.pdf`.
- Produces: modal independente dos filtros da listagem, com estado e Centro de Custo.

- [ ] Adicionar método de download autenticado.
- [ ] Implementar modal e disparar download do blob com nome retornado pela API.
- [ ] Executar testes e build do dashboard.

### Task 5: Verificação e publicação

**Files:**
- Verify: todos os arquivos acima.

- [ ] Rodar testes direcionados, suites e builds.
- [ ] Revisar diff e confirmar que arquivos locais não relacionados ficaram fora.
- [ ] Criar commit apenas com os arquivos da funcionalidade.
- [ ] Enviar `main` para `origin` e informar o comando de atualização do servidor.
