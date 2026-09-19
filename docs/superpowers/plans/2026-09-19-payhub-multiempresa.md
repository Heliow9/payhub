# PayHub Multiempresa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Converter o PayHub para isolamento multiempresa, preservando integralmente a RealEnergy e permitindo um único CPF/PIN acessar vínculos de várias empresas.

**Architecture:** A base MySQL continuará compartilhada, com `company_id` obrigatório nas raízes de domínio e obtido exclusivamente da sessão. Usuários administrativos continuam globais por e-mail, pertencem a uma empresa e cada empresa possui exatamente um MASTER; funcionários ganham identidade global por CPF e vínculos empresariais separados. O conector, a fila, o worker e todos os serviços passam a operar com contexto empresarial explícito.

**Tech Stack:** Node.js 22, TypeScript 5.9, Express 5, MySQL 5.6+, React 19/Vite, Expo/React Native, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-19-payhub-multiempresa-design.md`

## Global Constraints

- Preservar IDs, credenciais, hashes e caminhos dos documentos existentes da RealEnergy.
- Manter `users.email` globalmente único.
- Manter exatamente um MASTER ativo por empresa e impedir sua desativação sem transferência transacional.
- Manter um único PIN global por CPF; um novo vínculo nunca repete primeiro acesso quando o PIN já existe.
- `company_id` sempre vem da sessão ou da cadeia persistida; nunca confiar no tenant enviado pelo frontend.
- Recursos de outra empresa devem responder como não encontrados.
- `sage_company_code` é configuração da empresa, não é o identificador interno do tenant.
- Vínculo `TERMINATED` permite somente acesso histórico; `DISABLED` não permite login.
- Continuar compatível com MySQL 5.6; não usar partial indexes, CTEs, JSON nativo ou `ADD COLUMN IF NOT EXISTS`.
- Não integrar com o Ponto Certo SaaS nesta entrega; apenas expor um serviço interno idempotente pronto para o futuro.
- Preservar as alterações locais existentes em `apps/mobile`, autenticação mobile e demais arquivos não relacionados.
- Instalar dependências para verificação com `npm install --ignore-scripts --no-package-lock`, pois o checkout atual não resolve Vitest/TypeScript e o `package-lock.json` local não deve ser sobrescrito.

## Baseline conhecido

- Em 2026-09-19, `npm test --workspace @payhub/api` e `npm test --workspace @payhub/dashboard` não iniciam porque `vitest` não está resolvido no `node_modules` atual.
- Os builds também falham por dependências ausentes (`express`, `mysql2`, `vite/client` e outras), não por um erro multiempresa.
- `apps/api/src/app.test.ts` usa uma assinatura antiga de `createApp`; ele deve ser substituído por testes da pilha ativa em vez de ser usado como baseline funcional.
- A pilha ativa é `apps/api/src/app.ts`, `apps/api/src/routes/*`, `apps/api/src/services/*` e `apps/api/src/db/*`. A árvore `src/http`, `src/domain` e `src/infra` é legado compilável e não deve receber a implementação multiempresa.

## Review Focus

- Mesmo CPF com PIN existente recebe um segundo vínculo e entra sem data de nascimento; coberto no Task 3.
- Um ID válido da empresa B usado em sessão da empresa A retorna 404 e não 403; coberto nos Tasks 5, 6 e 7.
- O único MASTER não pode ser desativado e um segundo MASTER não pode ser criado; coberto no Task 4.
- Um conector não pode reivindicar, atualizar nem concluir job de outra empresa; coberto no Task 5.
- Migração preserva quantidade de credenciais, assinaturas e SHA-256 de documentos; coberto nos Tasks 1 e 11.

---

## File Structure

### Novos arquivos

- `apps/api/src/db/migrations/005_multi_company.sql` — expansão e backfill da RealEnergy.
- `apps/api/src/core/tenant.ts` — tipos de contexto e guardas puras de empresa/acesso histórico.
- `apps/api/src/services/company-provisioning.service.ts` — criação transacional e idempotente de empresa + MASTER + configurações.
- `apps/api/src/scripts/verify-multi-company-migration.ts` — relatório de integridade do legado.
- `apps/api/src/tests/multi-company-migration.test.ts` — contrato estrutural da migration.
- `apps/api/src/tests/tenant-context.test.ts` — invariantes puras do contexto.
- `apps/api/src/tests/admin-tenancy.test.ts` — login administrativo e invariantes do MASTER.
- `apps/api/src/tests/employee-multi-company-auth.test.ts` — identidade global e seletor.
- `apps/api/src/tests/connector-tenancy.test.ts` — isolamento da fila.
- `apps/api/src/tests/resource-tenancy.test.ts` — isolamento de grupos, funcionários e holerites.
- `apps/api/src/tests/worker-tenancy.test.ts` — escopo de agendas e alertas.
- `apps/dashboard/src/auth/company-selection.ts` — estado e tipos da seleção de empresa.
- `apps/dashboard/src/auth/company-selection.test.ts` — testes do fluxo web.
- `apps/dashboard/src/components/CompanySelector.tsx` — seletor reutilizável.
- `apps/mobile/src/auth/company-selection.ts` — estado e tipos da seleção mobile.
- `apps/mobile/src/components/CompanySelector.tsx` — seletor mobile.
- `DEPLOY-MULTIEMPRESA.md` — execução, validação e rollback.

### Arquivos modificados

- Tipos e autenticação: `apps/api/src/core/types.ts`, `apps/api/src/express.d.ts`, `apps/api/src/middleware/auth.ts`, `apps/api/src/services/auth.service.ts`, `apps/api/src/routes/auth.routes.ts`.
- Composição: `apps/api/src/app.ts`, `apps/api/package.json`.
- Domínio empresarial: `apps/api/src/services/{audit,connector,employee,group,notification,payroll-run,payroll,settings,signature}.service.ts`.
- Rotas: `apps/api/src/routes/{audit,connector-agent,connectors,dashboard,employees,groups,import-jobs,notifications,payrolls,settings,users}.routes.ts`.
- Worker e bootstrap: `apps/api/src/worker/main.ts`, `apps/api/src/db/bootstrap-master.ts`.
- Dashboard: `apps/dashboard/src/api/client.ts`, `apps/dashboard/src/auth/AuthProvider.tsx`, `apps/dashboard/src/pages/LoginPage.tsx`, `apps/dashboard/src/components/AppShell.tsx`, `apps/dashboard/src/pages/{Employees,Groups,Settings}Page.tsx` e testes correspondentes.
- Mobile: `apps/mobile/src/lib/api.ts`, `apps/mobile/src/auth/AuthProvider.tsx`, `apps/mobile/src/app/login.tsx`, `apps/mobile/src/app/(employee)/_layout.tsx`.

---

### Task 1: Schema multiempresa e backfill da RealEnergy

**Files:**
- Create: `apps/api/src/db/migrations/005_multi_company.sql`
- Create: `apps/api/src/tests/multi-company-migration.test.ts`
- Create: `apps/api/src/scripts/verify-multi-company-migration.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces: `companies`, `company_masters`, `employee_identities`, `employee_company_selections` e colunas `company_id`/`identity_id` usadas por todos os tasks seguintes.
- Produces: script `npm run verify:multi-company --workspace @payhub/api` que encerra com código diferente de zero quando a migração não preserva o legado.

- [ ] **Step 1: Escrever o teste estrutural que falha sem a migration**

```ts
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(new URL('../db/migrations/005_multi_company.sql', import.meta.url), 'utf8');

describe('005_multi_company.sql', () => {
  it('cria identidade global, empresa e isolamento nas raízes', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS companies/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS company_masters/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS employee_identities/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS employee_company_selections/i);
    for (const table of ['users','sessions','audit_logs','connectors','import_jobs','employee_groups','employees','employee_sessions','payroll_runs','schedule_executions','payrolls','notifications','push_preferences','push_subscriptions']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE ${table}[^;]+company_id`, 'i'));
    }
  });

  it('faz backfill da RealEnergy e preserva credenciais', () => {
    expect(sql).toContain("'realenergy'");
    expect(sql).toMatch(/sage_company_code[^;]*'1'/i);
    expect(sql).toMatch(/INSERT INTO employee_identities[\s\S]+employee_credentials/i);
    expect(sql).toMatch(/UPDATE employees[\s\S]+identity_id/i);
    expect(sql).toMatch(/admin@realenergy\.com\.br/i);
  });
});
```

- [ ] **Step 2: Executar o teste e confirmar falha por arquivo ausente**

Run: `npm test --workspace @payhub/api -- src/tests/multi-company-migration.test.ts`

Expected: FAIL com `ENOENT` para `005_multi_company.sql`.

- [ ] **Step 3: Criar a migration aditiva MySQL 5.6**

Implementar SQL explícito que:

```sql
CREATE TABLE IF NOT EXISTS companies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_name VARCHAR(190) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  status ENUM('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  sage_company_code VARCHAR(20) NOT NULL,
  external_source VARCHAR(40) NULL,
  external_id VARCHAR(190) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_companies_slug (slug),
  UNIQUE KEY uk_companies_external (external_source, external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO companies
  (legal_name,display_name,slug,status,sage_company_code,created_at,updated_at)
SELECT 'RealEnergy','RealEnergy','realenergy','ACTIVE','1',UTC_TIMESTAMP(),UTC_TIMESTAMP()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE slug='realenergy');

SET @realenergy_company_id := (SELECT id FROM companies WHERE slug='realenergy' LIMIT 1);
```

Criar `employee_identities` copiando CPF, nascimento e todos os campos de `employee_credentials`; adicionar `employees.identity_id`; adicionar e preencher `company_id` em cada raiz; trocar `uk_employees_cpf` por `(company_id,cpf)`; trocar `uk_employee_groups_name` por `(company_id,name)`; manter `(company_id,sage_employee_code)`; criar FKs e índices por empresa somente depois do backfill.

Criar `employee_company_selections` com `token_hash CHAR(64) UNIQUE`, `identity_id`, `expires_at`, `used_at`, metadados de cliente e timestamps. Criar `company_masters` com `company_id` como PK e `user_id` único. Registrar o usuário `admin@realenergy.com.br` e, como fallback controlado, o único MASTER atual da RealEnergy.

- [ ] **Step 4: Criar o verificador de migração**

```ts
export interface MigrationCheck { name: string; value: number; expected?: number; ok: boolean }

export async function verifyMultiCompanyMigration(pool: Pool): Promise<MigrationCheck[]> {
  // Executar consultas para company_id nulo, identity_id nulo, CPF duplicado na identidade,
  // usuário sem empresa, empresa sem exatamente um MASTER e filhos órfãos.
  // Comparar employee_credentials com employee_identities que possuem pin_hash.
  // Verificar que payroll_documents.original_sha256/signed_sha256 continuam preenchidos
  // para os mesmos payroll_id; o script nunca reescreve arquivos.
}
```

Adicionar a `apps/api/package.json`:

```json
"verify:multi-company": "tsx src/scripts/verify-multi-company-migration.ts"
```

- [ ] **Step 5: Rodar teste, build e inspeção SQL**

Run: `npm test --workspace @payhub/api -- src/tests/multi-company-migration.test.ts`

Expected: PASS.

Run: `rg -n "DROP TABLE|TRUNCATE|DELETE FROM (employees|payrolls|payroll_documents|signature)" apps/api/src/db/migrations/005_multi_company.sql`

Expected: nenhuma ocorrência.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/migrations/005_multi_company.sql apps/api/src/tests/multi-company-migration.test.ts apps/api/src/scripts/verify-multi-company-migration.ts apps/api/package.json
git commit -m "feat: add multi-company schema and RealEnergy backfill"
```

---

### Task 2: Contexto empresarial e sessão administrativa

**Files:**
- Create: `apps/api/src/core/tenant.ts`
- Create: `apps/api/src/tests/tenant-context.test.ts`
- Modify: `apps/api/src/core/types.ts`
- Modify: `apps/api/src/express.d.ts`
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/services/auth.service.ts`
- Modify: `apps/api/src/routes/auth.routes.ts`

**Interfaces:**
- Produces: `UserPrincipal`, `EmployeePrincipal`, `Principal`, `UserContext`, `EmployeeContext`, `RequestContext`.
- Produces: `requestContext(req): RequestContext`, `assertFullEmployeeAccess(principal)`.
- Preserva: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`.

- [ ] **Step 1: Escrever testes falhos para os tipos e guardas**

```ts
import { describe, expect, it } from 'vitest';
import { assertFullEmployeeAccess, contextFromPrincipal } from '../core/tenant.js';

it('produz contexto da empresa do principal', () => {
  expect(contextFromPrincipal({kind:'USER',id:7,companyId:3,companyName:'ACME',name:'Ana',email:'a@acme.com',role:'MASTER',status:'ACTIVE'})).toMatchObject({companyId:3,userId:7,role:'MASTER'});
});

it('bloqueia mutação para vínculo histórico', () => {
  expect(() => assertFullEmployeeAccess({kind:'EMPLOYEE',id:9,identityId:4,companyId:3,companyName:'ACME',name:'João',cpf:'00000000000',status:'TERMINATED',accessMode:'HISTORICAL'})).toThrow(/histórico/i);
});
```

- [ ] **Step 2: Executar e confirmar falha**

Run: `npm test --workspace @payhub/api -- src/tests/tenant-context.test.ts`

Expected: FAIL porque `core/tenant.ts` não existe.

- [ ] **Step 3: Definir contratos de autenticação**

```ts
export type UserPrincipal = {
  kind:'USER'; id:number; companyId:number; companyName:string; name:string;
  email:string; role:'MASTER'|'ANALISTA'; status:'ACTIVE'|'DISABLED';
};
export type EmployeePrincipal = {
  kind:'EMPLOYEE'; id:number; identityId:number; companyId:number; companyName:string;
  name:string; cpf:string; status:'ACTIVE'|'DISABLED'|'TERMINATED';
  accessMode:'FULL'|'HISTORICAL';
};
export type Principal = UserPrincipal | EmployeePrincipal;
```

`Express.Request` mantém `principal`, `sessionTokenHash`, `csrfHash` e ganha `connectorCompanyId`.

- [ ] **Step 4: Escopar sessões administrativas**

Alterar `adminLogin` e `authenticate` para juntar `users`, `companies` e `sessions`, exigir `u.company_id=s.company_id`, empresa ativa e retornar `companyId/companyName`. `makeAdminSession` recebe `companyId` e grava na sessão. `GET /auth/me` devolve o principal enriquecido sem alterar cookie ou credencial.

Consulta obrigatória:

```sql
SELECT s.id sessionId,s.csrf_token_hash csrfHash,
       u.id,u.company_id companyId,c.display_name companyName,
       u.name,u.email,u.role,u.status
FROM sessions s
JOIN users u ON u.id=s.user_id AND u.company_id=s.company_id
JOIN companies c ON c.id=s.company_id AND c.status='ACTIVE'
WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>UTC_TIMESTAMP()
LIMIT 1
```

- [ ] **Step 5: Rodar testes de autenticação compatível**

Run: `npm test --workspace @payhub/api -- src/tests/tenant-context.test.ts src/tests/auth-compat.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/core/tenant.ts apps/api/src/tests/tenant-context.test.ts apps/api/src/core/types.ts apps/api/src/express.d.ts apps/api/src/middleware/auth.ts apps/api/src/services/auth.service.ts apps/api/src/routes/auth.routes.ts
git commit -m "feat: carry company context in admin sessions"
```

---

### Task 3: Identidade global, primeiro acesso e seletor de empresa

**Files:**
- Create: `apps/api/src/tests/employee-multi-company-auth.test.ts`
- Modify: `apps/api/src/services/auth.service.ts`
- Modify: `apps/api/src/routes/auth.routes.ts`
- Modify: `apps/api/src/core/types.ts`

**Interfaces:**
- Produces: `LoginOutcome = LoginResult | CompanySelectionResult`.
- Produces: `AuthService.selectEmployeeCompany(selectionToken, companyId, meta)`.
- Produces: `POST /api/auth/select-company` e `POST /api/auth/switch-company`.

- [ ] **Step 1: Escrever testes falhos do fluxo multiempresa**

Cobrir com um pool falso orientado às queries do serviço:

```ts
it('reutiliza PIN e pede seleção para duas empresas', async () => {
  const result = await auth.employeeLogin(CPF, '123456', meta);
  expect(result).toMatchObject({requiresCompanySelection:true});
  expect(result.companies).toEqual([
    expect.objectContaining({companyId:1,status:'TERMINATED',accessMode:'HISTORICAL'}),
    expect.objectContaining({companyId:2,status:'ACTIVE',accessMode:'FULL'}),
  ]);
});

it('não exige nascimento quando identity.pin_hash já existe', async () => {
  const result = await auth.employeeLogin(CPF, '123456', meta);
  expect(result).not.toMatchObject({code:'PIN_NOT_SET'});
});

it('token de seleção é único, curto e não aceita empresa alheia', async () => {
  await expect(auth.selectEmployeeCompany('token', 999, meta)).rejects.toMatchObject({statusCode:401});
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @payhub/api -- src/tests/employee-multi-company-auth.test.ts`

Expected: FAIL porque o login ainda consulta `employees.cpf` diretamente.

- [ ] **Step 3: Implementar autenticação da identidade**

`employeeLogin` consulta `employee_identities` por CPF, valida um único `pin_hash`, aplica lock global e carrega vínculos `ACTIVE` e `TERMINATED` junto com `companies.status='ACTIVE'`.

Quando houver um vínculo, chamar `makeEmployeeSession(identityId, employeeId, companyId, meta)`. Quando houver vários, criar token aleatório, persistir `sha256(token)` em `employee_company_selections` e retornar:

```ts
type CompanySelectionResult = {
  requiresCompanySelection:true;
  selectionToken:string;
  companies:Array<{companyId:number;companyName:string;employeeId:number;status:'ACTIVE'|'TERMINATED';accessMode:'FULL'|'HISTORICAL'}>;
};
```

- [ ] **Step 4: Implementar primeiro acesso global**

`firstAccess` consulta `employee_identities` por CPF. Se `pin_hash` existe, retorna `PIN_ALREADY_SET` sem comparar nascimento. Se não existe, compara `employee_identities.birth_date`, grava o PIN uma vez e segue o mesmo resolvedor de vínculos do login.

- [ ] **Step 5: Implementar seleção e troca**

`selectEmployeeCompany` bloqueia a linha do token, valida expiração/uso e associação `identity_id + company_id + employee status`, marca `used_at` e emite sessão. `switch-company` exige principal EMPLOYEE, revalida a identidade, revoga a sessão atual e cria a nova.

Rotas retornam cookie para `WEB` e `accessToken` para `MOBILE` somente quando o resultado é uma sessão completa; seleção intermediária não grava cookie nem SecureStore.

- [ ] **Step 6: Rodar testes**

Run: `npm test --workspace @payhub/api -- src/tests/employee-multi-company-auth.test.ts src/tests/auth-compat.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tests/employee-multi-company-auth.test.ts apps/api/src/services/auth.service.ts apps/api/src/routes/auth.routes.ts apps/api/src/core/types.ts
git commit -m "feat: add global employee identity and company selection"
```

---

### Task 4: Provisionamento, usuários administrativos e configurações

**Files:**
- Create: `apps/api/src/services/company-provisioning.service.ts`
- Create: `apps/api/src/tests/admin-tenancy.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/services/auth.service.ts`
- Modify: `apps/api/src/services/settings.service.ts`
- Modify: `apps/api/src/routes/users.routes.ts`
- Modify: `apps/api/src/routes/settings.routes.ts`
- Modify: `apps/api/src/db/bootstrap-master.ts`

**Interfaces:**
- Produces: `CompanyProvisioningService.provision(input): Promise<{companyId:number;masterUserId:number;alreadyProvisioned:boolean}>`.
- Produces: `AuthService.createAnalyst(context, name, email, password, meta)`.
- Produces: `SettingsService.get(companyId)` e `update(companyId, actorId, input, meta)`.

- [ ] **Step 1: Escrever testes falhos das invariantes administrativas**

```ts
it('recusa email administrativo já existente em qualquer empresa', async () => {
  await expect(provisioning.provision(inputWithExistingEmail)).rejects.toMatchObject({code:'EMAIL_ALREADY_EXISTS'});
});

it('cria empresa, único MASTER e settings na mesma transação', async () => {
  const result = await provisioning.provision(input);
  expect(result).toMatchObject({companyId:2,masterUserId:9,alreadyProvisioned:false});
  expect(transactionLog).toEqual(expect.arrayContaining(['BEGIN','INSERT companies','INSERT users MASTER','INSERT company_masters','INSERT settings','COMMIT']));
});

it('não desativa o MASTER apontado por company_masters', async () => {
  const response = await setStatus(masterId, 'DISABLED');
  expect(response).toMatchObject({statusCode:409,code:'MASTER_REPLACEMENT_REQUIRED'});
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @payhub/api -- src/tests/admin-tenancy.test.ts`

Expected: FAIL porque não existe serviço de provisionamento nem escopo nos usuários/settings.

- [ ] **Step 3: Implementar provisionamento transacional**

```ts
export interface ProvisionCompanyInput {
  legalName:string; displayName:string; slug:string; sageCompanyCode:string;
  master:{name:string;email:string;password:string};
  externalSource?:string|null; externalId?:string|null; idempotencyKey?:string|null;
}
```

Bloquear duplicidade de e-mail antes do primeiro efeito; criar empresa, usuário MASTER, `company_masters` e settings na mesma conexão. Se `externalSource + externalId` já existe e os dados correspondem, retornar `alreadyProvisioned:true`; divergência retorna `PROVISIONING_CONFLICT`.

- [ ] **Step 4: Escopar gestão de usuários**

Listar usuários com `WHERE company_id=?`. `createAnalyst` força `company_id` da sessão. Alteração de status exige `id=? AND company_id=? AND role='ANALISTA'`. O endpoint não aceita `companyId` no corpo.

- [ ] **Step 5: Escopar configurações e bootstrap**

Trocar o singleton `app_settings.id=1` por lookup por `company_id`. O bootstrap existente passa a invocar `CompanyProvisioningService` somente em bancos vazios e nunca cria um segundo MASTER na RealEnergy.

- [ ] **Step 6: Rodar testes**

Run: `npm test --workspace @payhub/api -- src/tests/admin-tenancy.test.ts src/tests/tenant-context.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/company-provisioning.service.ts apps/api/src/tests/admin-tenancy.test.ts apps/api/src/app.ts apps/api/src/services/auth.service.ts apps/api/src/services/settings.service.ts apps/api/src/routes/users.routes.ts apps/api/src/routes/settings.routes.ts apps/api/src/db/bootstrap-master.ts
git commit -m "feat: scope administration and settings by company"
```

---

### Task 5: Isolamento de conectores e filas

**Files:**
- Create: `apps/api/src/tests/connector-tenancy.test.ts`
- Modify: `apps/api/src/services/connector.service.ts`
- Modify: `apps/api/src/routes/connectors.routes.ts`
- Modify: `apps/api/src/routes/import-jobs.routes.ts`
- Modify: `apps/api/src/routes/connector-agent.routes.ts`
- Modify: `apps/api/src/express.d.ts`

**Interfaces:**
- `authenticateConnector(id, token)` produz `{connectorId:number;companyId:number}`.
- `createJob` exige `companyId` e deriva `companyCode` do cadastro da empresa.
- `claimNext(connectorId, companyId)` reivindica somente jobs da mesma empresa.

- [ ] **Step 1: Escrever testes falhos de isolamento da fila**

```ts
it('connector A ignora o job mais antigo da empresa B', async () => {
  const job = await service.claimNext(11, 1);
  expect(job).toMatchObject({id:22,companyId:1});
});

it('connector A não atualiza job já reivindicado pela empresa B', async () => {
  await expect(service.complete(99, 11, 1, 'ok')).rejects.toMatchObject({statusCode:400});
});

it('listagem administrativa não revela jobs da empresa B', async () => {
  expect(await service.listJobs(1, 100)).not.toEqual(expect.arrayContaining([expect.objectContaining({companyId:2})]));
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @payhub/api -- src/tests/connector-tenancy.test.ts`

Expected: FAIL porque `claimNext` usa a fila global.

- [ ] **Step 3: Escopar serviço e agente**

Todas as queries de connector/job/log/batch incluem `company_id`. A autenticação do connector injeta `req.connectorCompanyId`. O claim usa:

```sql
SELECT id,payroll_run_id payrollRunId
FROM import_jobs
WHERE status='QUEUED' AND company_id=?
ORDER BY id ASC LIMIT 1 FOR UPDATE
```

`assertOwnedJob` exige `job_id`, `connector_id`, `company_id` e `RUNNING`.

- [ ] **Step 4: Derivar companyCode no servidor**

Ao criar job, carregar `companies.sage_company_code` por `companyId`; substituir qualquer `scope.companyCode` recebido. Persistir `payhubCompanyId` e `companyCode` canônicos no `scope_json`.

- [ ] **Step 5: Rodar testes**

Run: `npm test --workspace @payhub/api -- src/tests/connector-tenancy.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tests/connector-tenancy.test.ts apps/api/src/services/connector.service.ts apps/api/src/routes/connectors.routes.ts apps/api/src/routes/import-jobs.routes.ts apps/api/src/routes/connector-agent.routes.ts apps/api/src/express.d.ts
git commit -m "feat: isolate Sage connectors and jobs by company"
```

---

### Task 6: Grupos, funcionários e execuções de folha

**Files:**
- Create: `apps/api/src/tests/resource-tenancy.test.ts`
- Modify: `apps/api/src/services/group.service.ts`
- Modify: `apps/api/src/services/employee.service.ts`
- Modify: `apps/api/src/services/payroll-run.service.ts`
- Modify: `apps/api/src/routes/groups.routes.ts`
- Modify: `apps/api/src/routes/employees.routes.ts`

**Interfaces:**
- Métodos administrativos recebem `UserContext`.
- Métodos do funcionário recebem `EmployeeContext`.
- `createFromLookup` liga o CPF a uma identidade existente sem alterar `pin_hash`.

- [ ] **Step 1: Escrever testes falhos de recursos cruzados**

```ts
it.each(['group','employee'])('%s da empresa B responde not found sob contexto A', async (kind) => {
  await expect(loadResource(kind, {companyId:1,userId:1,role:'MASTER'}, 200)).rejects.toMatchObject({statusCode:404});
});

it('CPF existente cria novo vínculo e preserva credencial', async () => {
  const id = await employees.createFromLookup(companyBContext, jobId, groupBId, undefined, meta);
  expect(id).toBeGreaterThan(0);
  expect(sqlLog).not.toContain('UPDATE employee_identities SET pin_hash');
});

it('grupo de outra empresa não pode receber o funcionário', async () => {
  await expect(employees.moveGroup(companyAContext, employeeA, groupB, meta)).rejects.toMatchObject({statusCode:400});
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @payhub/api -- src/tests/resource-tenancy.test.ts`

Expected: FAIL porque listagens e lookups são globais.

- [ ] **Step 3: Escopar grupos**

Aplicar `g.company_id=?` em list/get/create/update e schedules. A criação usa `companyId` do contexto e a configuração Sage da empresa; remover literais `'1'`.

- [ ] **Step 4: Escopar funcionários e identidade**

Aplicar empresa em lookup, resultado, criação, sincronização, detalhe, lista, grupo, status e exclusão. Ao cadastrar CPF:

```sql
INSERT INTO employee_identities (cpf,birth_date,created_at,updated_at)
VALUES (?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id),updated_at=updated_at
```

Usar a identidade retornada; se ela possui PIN, não alterar nascimento nem credencial. Divergência de nascimento retorna `EMPLOYEE_IDENTITY_CONFLICT` antes de criar o vínculo.

- [ ] **Step 5: Escopar execuções**

`startGroup` e `startEmployee` validam a empresa, gravam `payroll_runs.company_id` e criam job na mesma empresa. O `companyCode` vem de `companies.sage_company_code`.

- [ ] **Step 6: Rodar testes**

Run: `npm test --workspace @payhub/api -- src/tests/resource-tenancy.test.ts src/tests/manual-search.test.ts src/tests/employee-delete-policy.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tests/resource-tenancy.test.ts apps/api/src/services/group.service.ts apps/api/src/services/employee.service.ts apps/api/src/services/payroll-run.service.ts apps/api/src/routes/groups.routes.ts apps/api/src/routes/employees.routes.ts
git commit -m "feat: scope employees groups and payroll runs"
```

---

### Task 7: Holerites, assinaturas, downloads e links públicos

**Files:**
- Modify: `apps/api/src/tests/resource-tenancy.test.ts`
- Modify: `apps/api/src/services/payroll.service.ts`
- Modify: `apps/api/src/services/signature.service.ts`
- Modify: `apps/api/src/services/storage.service.ts`
- Modify: `apps/api/src/routes/payrolls.routes.ts`
- Modify: `apps/api/src/routes/public-sign.routes.ts`

**Interfaces:**
- Métodos administrativos de folha recebem `UserContext`.
- Métodos do portal recebem `EmployeeContext` e respeitam `accessMode`.
- Normalização recebe `jobId` e deriva `companyId` do job persistido.

- [ ] **Step 1: Ampliar testes falhos para folha e histórico**

```ts
it('não lista nem exporta holerite da empresa B', async () => {
  await expect(payrolls.exportSelected(companyAContext, [payrollB])).rejects.toMatchObject({statusCode:404});
});

it('vínculo histórico baixa liberado mas não assina pendente', async () => {
  await expect(payrolls.downloadEmployee(historicalContext, signedPayroll)).resolves.toBeDefined();
  await expect(signatures.signAuthenticated(historicalContext, pendingPayroll, input, meta)).rejects.toMatchObject({code:'HISTORICAL_ACCESS_ONLY'});
});

it('normalização rejeita employee de outra empresa', async () => {
  await expect(payrolls.normalizeCompletedJob(jobAWithEmployeeFromB)).rejects.toMatchObject({code:'JOB_COMPANY_MISMATCH'});
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @payhub/api -- src/tests/resource-tenancy.test.ts`

Expected: FAIL em listagem/exportação/assinatura sem escopo.

- [ ] **Step 3: Escopar normalização e administração**

Substituir `company_code='1'` pelo `companyId` do job e pelo `sage_company_code` persistido no escopo. List, detail, release, signatureLink, evidence e export incluem `p.company_id=?`. IDs ausentes no tenant retornam 404.

- [ ] **Step 4: Escopar portal e assinatura**

List/detail/download do funcionário exigem simultaneamente `employee_id` e `company_id`. `TERMINATED/HISTORICAL` pode ler documentos liberados ou assinados, mas `signAuthenticated` chama `assertFullEmployeeAccess`.

Links públicos resolvem `company_id` via joins; verify/sign usam o mesmo company na solicitação, payroll e employee. Não aceitar `companyId` do body.

- [ ] **Step 5: Preservar storage legado**

Leitura usa o caminho persistido sem alteração. Novos documentos usam:

```ts
const relativePath = `companies/${companyId}/payrolls/${year}/${month}/${payrollId}/original.pdf`;
```

Não mover nem regravar PDFs antigos durante migration.

- [ ] **Step 6: Rodar testes de assinatura/PDF**

Run: `npm test --workspace @payhub/api -- src/tests/resource-tenancy.test.ts src/tests/pdf.test.ts src/tests/signature-client-evidence.test.ts src/tests/signature-disclosure.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tests/resource-tenancy.test.ts apps/api/src/services/payroll.service.ts apps/api/src/services/signature.service.ts apps/api/src/services/storage.service.ts apps/api/src/routes/payrolls.routes.ts apps/api/src/routes/public-sign.routes.ts
git commit -m "feat: isolate payrolls signatures and documents"
```

---

### Task 8: Dashboard, auditoria, notificações e worker

**Files:**
- Create: `apps/api/src/tests/worker-tenancy.test.ts`
- Modify: `apps/api/src/services/audit.service.ts`
- Modify: `apps/api/src/services/notification.service.ts`
- Modify: `apps/api/src/routes/audit.routes.ts`
- Modify: `apps/api/src/routes/notifications.routes.ts`
- Modify: `apps/api/src/routes/dashboard.routes.ts`
- Modify: `apps/api/src/worker/main.ts`

**Interfaces:**
- `AuditService.record` exige `companyId`; `list(companyId, limit)`.
- `NotificationService.notifyAdmins(companyId, input, roles)`.
- Funções puras exportadas do worker para teste: `normalizeCompanyJobs`, `scheduleCompanyDue`, `notifyCompanyOperationalAlerts`.

- [ ] **Step 1: Escrever testes falhos do worker e notificações**

```ts
it('notifica somente administradores ativos da empresa do alerta', async () => {
  await notifications.notifyAdmins(1, input);
  expect(recipientIds).toEqual([masterA, analystA]);
});

it('agenda preserva company_id do grupo até run e job', async () => {
  const result = await scheduleCompanyDue(fakePool, services, now);
  expect(result).toContainEqual(expect.objectContaining({companyId:2,groupId:8}));
});

it('falha da empresa A não impede processar job da empresa B', async () => {
  expect(await normalizeCompanyJobs(fakePool, services)).toMatchObject({failed:[jobA],completed:[jobB]});
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @payhub/api -- src/tests/worker-tenancy.test.ts`

Expected: FAIL porque o worker não exporta unidades testáveis e notificações são globais.

- [ ] **Step 3: Escopar auditoria, notificações e dashboard**

Adicionar `company_id` em inserts/queries. O dashboard usa placeholders `?` em todas as métricas, connectors e runs. Push preferences/subscriptions incluem company e o dedup key inclui company.

- [ ] **Step 4: Decompor e escopar worker**

Extrair funções que recebem `pool/services` e processam itens individualmente. Queries carregam `company_id`; cada alerta chama `notifyAdmins(companyId, ...)`; cada loop captura erro por item e continua.

- [ ] **Step 5: Rodar testes**

Run: `npm test --workspace @payhub/api -- src/tests/worker-tenancy.test.ts src/tests/notification-policy.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tests/worker-tenancy.test.ts apps/api/src/services/audit.service.ts apps/api/src/services/notification.service.ts apps/api/src/routes/audit.routes.ts apps/api/src/routes/notifications.routes.ts apps/api/src/routes/dashboard.routes.ts apps/api/src/worker/main.ts
git commit -m "feat: isolate operations notifications and audit"
```

---

### Task 9: Seletor de empresa no dashboard/PWA

**Files:**
- Create: `apps/dashboard/src/auth/company-selection.ts`
- Create: `apps/dashboard/src/auth/company-selection.test.ts`
- Create: `apps/dashboard/src/components/CompanySelector.tsx`
- Modify: `apps/dashboard/src/api/client.ts`
- Modify: `apps/dashboard/src/auth/AuthProvider.tsx`
- Modify: `apps/dashboard/src/auth/AuthProvider.test.tsx`
- Modify: `apps/dashboard/src/pages/LoginPage.tsx`
- Modify: `apps/dashboard/src/pages/LoginPage.test.tsx`
- Modify: `apps/dashboard/src/components/AppShell.tsx`
- Modify: `apps/dashboard/src/pages/EmployeesPage.tsx`
- Modify: `apps/dashboard/src/pages/GroupsPage.tsx`

**Interfaces:**
- `api.login` e `api.firstAccess` retornam `AuthOutcome`.
- `api.selectCompany(selectionToken, companyId)` e `api.switchCompany(companyId)`.
- `AuthProvider` expõe `pendingSelection`, `selectCompany`, `switchCompany`.

- [ ] **Step 1: Escrever testes falhos do estado de seleção**

```ts
it('não define principal enquanto empresa precisa ser escolhida', async () => {
  mockLogin({requiresCompanySelection:true,selectionToken:'short',companies:[realEnergy,newCompany]});
  render(<AuthProvider><Probe /></AuthProvider>);
  await loginAsEmployee();
  expect(screen.getByText('Escolha a empresa')).toBeVisible();
  expect(screen.queryByText('Portal do funcionário')).not.toBeInTheDocument();
});

it('seleciona vínculo histórico e mostra empresa no shell', async () => {
  await chooseCompany('RealEnergy');
  expect(screen.getByText(/RealEnergy/)).toBeVisible();
  expect(screen.getByText(/Acesso histórico/)).toBeVisible();
});
```

- [ ] **Step 2: Confirmar falha**

Run: `npm test --workspace @payhub/dashboard -- src/auth/company-selection.test.ts src/auth/AuthProvider.test.tsx src/pages/LoginPage.test.tsx`

Expected: FAIL porque os tipos aceitam apenas sessão completa.

- [ ] **Step 3: Implementar contrato do cliente e provider**

```ts
export type CompanyOption={companyId:number;companyName:string;employeeId:number;status:'ACTIVE'|'TERMINATED';accessMode:'FULL'|'HISTORICAL'};
export type AuthOutcome=
  | {principal:Principal;csrfToken:string}
  | {requiresCompanySelection:true;selectionToken:string;companies:CompanyOption[]};
```

Somente persistir CSRF/principal no resultado completo. Limpar selection token em cancelamento/logout/erro expirado.

- [ ] **Step 4: Implementar tela e troca**

`CompanySelector` mostra nome e estado, sem valores técnicos. `AppShell` mostra `principal.companyName`; funcionários com múltiplos vínculos recebem ação “Trocar empresa”. Após troca, limpar caches locais e refazer `/auth/me`.

- [ ] **Step 5: Remover empresa fixa da interface**

Substituir “Empresa 1” por `principal.companyName` em funcionários/grupos. Manter `sageCompanyCode` somente na página de integração/configuração.

- [ ] **Step 6: Rodar testes e build**

Run: `npm test --workspace @payhub/dashboard -- src/auth/company-selection.test.ts src/auth/AuthProvider.test.tsx src/pages/LoginPage.test.tsx`

Expected: PASS.

Run: `npm run build --workspace @payhub/dashboard`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/src/auth/company-selection.ts apps/dashboard/src/auth/company-selection.test.ts apps/dashboard/src/components/CompanySelector.tsx apps/dashboard/src/api/client.ts apps/dashboard/src/auth/AuthProvider.tsx apps/dashboard/src/auth/AuthProvider.test.tsx apps/dashboard/src/pages/LoginPage.tsx apps/dashboard/src/pages/LoginPage.test.tsx apps/dashboard/src/components/AppShell.tsx apps/dashboard/src/pages/EmployeesPage.tsx apps/dashboard/src/pages/GroupsPage.tsx
git commit -m "feat: add employee company selection to web"
```

---

### Task 10: Seletor de empresa no aplicativo mobile

**Files:**
- Create: `apps/mobile/src/auth/company-selection.ts`
- Create: `apps/mobile/src/components/CompanySelector.tsx`
- Modify: `apps/mobile/src/lib/api.ts`
- Modify: `apps/mobile/src/auth/AuthProvider.tsx`
- Modify: `apps/mobile/src/app/login.tsx`
- Modify: `apps/mobile/src/app/(employee)/_layout.tsx`

**Interfaces:**
- Reutiliza o contrato JSON do Task 9.
- `saveSession` só é chamado depois de receber `accessToken` definitivo.

- [ ] **Step 1: Escrever o contrato puro de seleção mobile**

```ts
export function nextMobileAuthState(outcome: AuthOutcome): MobileAuthState {
  return 'requiresCompanySelection' in outcome
    ? {kind:'SELECT_COMPANY',selectionToken:outcome.selectionToken,companies:outcome.companies}
    : {kind:'AUTHENTICATED',principal:outcome.principal};
}
```

Criar teste unitário junto ao módulo quando o pacote mobile estiver com Vitest; enquanto o workspace mobile não possuir `package.json`, cobrir a função importando-a pelo teste de dashboard/API e validar o build Expo no Step 5.

- [ ] **Step 2: Adaptar API sem persistir token intermediário**

`login`/`firstAccess` retornam seleção sem exigir `accessToken`. `selectCompany` recebe `client:'MOBILE'`, salva `accessToken` e CSRF definitivos. `switchCompany` substitui os dois segredos no SecureStore.

- [ ] **Step 3: Implementar tela e contexto**

Após autenticação, `login.tsx` renderiza `CompanySelector` antes de navegar. Mostrar “Vínculo encerrado · acesso aos documentos anteriores” para `TERMINATED`. `_layout.tsx` exibe empresa atual e ação de troca.

- [ ] **Step 4: Garantir download no contexto atual**

O download continua usando Bearer token; ao trocar empresa, o token anterior é removido antes de salvar o novo para evitar uma requisição concorrente com contexto antigo.

- [ ] **Step 5: Verificar mobile**

Run quando `apps/mobile/package.json` estiver presente: `npm run typecheck --workspace @payhub/mobile`

Expected: PASS.

Se o pacote continuar ausente, executar: `npx tsc --noEmit --jsx react-jsx --moduleResolution bundler --module esnext --target es2022 apps/mobile/src/auth/company-selection.ts`

Expected: PASS para o módulo puro; registrar a ausência do manifesto como limitação preexistente, sem criar um pacote novo implicitamente.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/auth/company-selection.ts apps/mobile/src/components/CompanySelector.tsx apps/mobile/src/lib/api.ts apps/mobile/src/auth/AuthProvider.tsx apps/mobile/src/app/login.tsx "apps/mobile/src/app/(employee)/_layout.tsx"
git commit -m "feat: add employee company selection to mobile"
```

---

### Task 11: Regressão integrada, relatório e runbook de deploy

**Files:**
- Replace: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/tests/multi-company-migration.test.ts`
- Create: `DEPLOY-MULTIEMPRESA.md`
- Modify: `README.md`

**Interfaces:**
- Produces: suíte HTTP da pilha ativa e roteiro operacional reproduzível.

- [ ] **Step 1: Substituir fixture obsoleta por teste HTTP da aplicação ativa**

Criar fixture de Pool/Services que cubra:

```ts
it('mantém login direto do MASTER da RealEnergy', async () => {
  const login = await request(app).post('/api/auth/login').send({identifier:'admin@realenergy.com.br',password:'secret'});
  expect(login.status).toBe(200);
  expect(login.body.principal).toMatchObject({kind:'USER',companyId:1,role:'MASTER'});
});

it('não expõe recurso da empresa B em sessão A', async () => {
  const response = await companyAAgent.get('/api/employees/200');
  expect(response.status).toBe(404);
});

it('seleciona empresa após CPF com dois vínculos', async () => {
  const login = await request(app).post('/api/auth/login').send({identifier:CPF,password:'123456'});
  expect(login.body.requiresCompanySelection).toBe(true);
  const selected = await request(app).post('/api/auth/select-company').send({selectionToken:login.body.selectionToken,companyId:2});
  expect(selected.body.principal).toMatchObject({kind:'EMPLOYEE',companyId:2,identityId:10});
});
```

- [ ] **Step 2: Rodar toda a suíte e builds**

Run: `npm test`

Expected: todas as suítes API/dashboard passam.

Run: `npm run build`

Expected: API e dashboard compilam; mobile segue a verificação definida no Task 10.

- [ ] **Step 3: Executar auditoria estática de literais e queries globais**

Run: `rg -n "company_code='1'|company_code,.*'1'|Empresa fixa|Empresa 1" apps/api/src apps/dashboard/src apps/mobile/src`

Expected: nenhuma regra operacional fixa; ocorrências permitidas apenas em migration/teste de legado.

Run: `rg -n "FROM (employees|employee_groups|payrolls|connectors|import_jobs|users|audit_logs)" apps/api/src/services apps/api/src/routes apps/api/src/worker`

Expected: cada ocorrência administrativa possui filtro de empresa direto ou join com pai já filtrado; revisar manualmente cada linha.

- [ ] **Step 4: Produzir runbook explícito**

`DEPLOY-MULTIEMPRESA.md` deve conter comandos nesta ordem:

```powershell
mysqldump --single-transaction --routines --triggers <database> > payhub-before-multiempresa.sql
npm run db:migrate
npm run verify:multi-company --workspace @payhub/api
npm test
npm run build
pm2 startOrReload ecosystem.config.cjs
pm2 save
```

Documentar ensaio em cópia do banco, conferência dos hashes, eventual invalidação de sessões, teste do conector RealEnergy e rollback de código sem remover as colunas novas.

- [ ] **Step 5: Validar relatório em banco de homologação**

Run: `npm run verify:multi-company --workspace @payhub/api`

Expected: todos os checks `ok=true`, zero registros órfãos/sem empresa, uma empresa RealEnergy, um MASTER ativo e paridade de credenciais.

- [ ] **Step 6: Smoke test de duas empresas**

Provisionar uma empresa de homologação pelo serviço interno, criar funcionário com CPF já existente e validar:

```text
MASTER RealEnergy vê somente RealEnergy
MASTER homologação vê somente homologação
CPF + PIN retorna duas empresas
RealEnergy TERMINATED abre histórico
homologação ACTIVE permite fluxo completo
connector RealEnergy não recebe job homologação
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/app.test.ts apps/api/src/tests/multi-company-migration.test.ts DEPLOY-MULTIEMPRESA.md README.md
git commit -m "test: verify PayHub multi-company isolation"
```

---

## Final Verification

- [ ] `git diff --check` não reporta erro.
- [ ] `npm test` passa.
- [ ] `npm run build` passa para os workspaces configurados.
- [ ] `npm run verify:multi-company --workspace @payhub/api` passa no clone do banco real.
- [ ] `rg` não encontra empresa Sage `1` fixa fora de migration/testes legados.
- [ ] Teste manual RealEnergy preserva login, connector, importação, assinatura, download, notificações e auditoria.
- [ ] Teste manual da segunda empresa comprova ausência de vazamento por listagem e por ID conhecido.
- [ ] Hashes de PDFs existentes coincidem com o relatório anterior à migration.
- [ ] Revisão final compara cada critério de aceite da especificação com evidência de teste ou comando executado.
