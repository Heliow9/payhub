# PayHub Durable Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que todo job Sage concluído seja normalizado automaticamente, com claim durável, recuperação após interrupção, notificações desacopladas e saúde observável do worker.

**Architecture:** O MySQL permanece como fonte de verdade e recebe leases de normalização, heartbeat e outbox de Push. O worker reivindica jobs por atualização condicional, processa holerites de forma idempotente e encerra o processo quando o watchdog detecta ciclo travado, permitindo recuperação pelo PM2.

**Tech Stack:** Node.js 22, TypeScript 5.9, MySQL 8/mysql2, Vitest, Express 5, React/Vite, PM2.

**Spec:** `docs/superpowers/specs/2026-09-20-payhub-durable-worker-design.md`

## Global Constraints

- Não introduzir Redis, RabbitMQ ou outro serviço externo.
- Preservar IDs, documentos, hashes, credenciais e dados existentes da RealEnergy.
- Toda leitura e mutação de domínio permanece isolada por `company_id`.
- Notificações externas não podem bloquear criação ou conclusão de holerites.
- Jobs históricos já normalizados não podem ser reprocessados.
- Holerites assinados nunca podem ser rebaixados, substituídos ou regenerados.
- Esquema novo deve ser aditivo e compatível com a API anterior durante a migration.
- Não registrar CPF, PIN, senhas, tokens ou payloads Sage nos logs.

## Review Focus

- Lease expirando enquanto um PDF ainda é processado: renovar após cada documento e impedir segundo claim enquanto o lease estiver válido; coberto na Task 2.
- Worker encerrado depois de gravar arquivo e antes do commit: banco deve reverter e arquivo órfão não pode aparecer; coberto na Task 3.
- Mesmo hash em registro `PROCESSING`/`ERROR`: reparar o registro em vez de marcá-lo como unchanged; coberto na Task 3.
- Notificação deduplicada sem outbox ou outbox duplicada: notificação e entrega devem ser atômicas; coberto na Task 4.
- Heartbeat antigo com processo PM2 vivo: API deve reportar `STALE`, nunca `HEALTHY`; coberto na Task 6.

---

## Mapa de arquivos

**Criar**

- `apps/api/src/db/migrations/006_durable_worker.sql` — estruturas e backfill do worker durável.
- `apps/api/src/services/normalization-queue.service.ts` — claim, renovação, conclusão e falha de normalização.
- `apps/api/src/services/notification-outbox.service.ts` — claim e entrega assíncrona de Push.
- `apps/api/src/services/worker-heartbeat.service.ts` — estado operacional persistido.
- `apps/api/src/worker/watchdog.ts` — prazo fatal do ciclo, isolado e testável.
- `apps/api/src/scripts/verify-durable-worker.ts` — invariantes de produção.
- `apps/api/src/tests/durable-worker-migration.test.ts` — contrato da migration.
- `apps/api/src/tests/normalization-queue.test.ts` — concorrência e leases.
- `apps/api/src/tests/notification-outbox.test.ts` — entrega, deduplicação e retentativa.
- `apps/api/src/tests/worker-watchdog.test.ts` — prazo e encerramento controlado.
- `apps/dashboard/src/components/WorkerHealth.tsx` — saúde do worker.
- `apps/dashboard/src/components/WorkerHealth.test.tsx` — estados visualizados.
- `DEPLOY-DURABLE-WORKER.md` — implantação e rollback.

**Modificar**

- `apps/api/src/config/env.ts` — limites configuráveis.
- `apps/api/src/db/mysql.ts` — keep-alive, timeout de conexão e fila finita.
- `apps/api/src/app.ts` — registrar novos serviços.
- `apps/api/src/services/payroll.service.ts` — normalização retomável e notificação via outbox.
- `apps/api/src/services/notification.service.ts` — persistir notificação/outbox sem aguardar rede.
- `apps/api/src/services/connector.service.ts` — expor estado de normalização nos jobs.
- `apps/api/src/worker/main.ts` — ciclo com claim, heartbeat, outbox e watchdog.
- `apps/api/src/routes/dashboard.routes.ts` — saúde do worker.
- `apps/api/src/tests/worker-tenancy.test.ts` — ordem, isolamento e falha independente.
- `apps/api/src/tests/multi-company-migration.test.ts` — incluir migration 006.
- `apps/api/src/scripts/verify-multi-company-migration.ts` — invariantes adicionais.
- `apps/api/package.json` — script de verificação durável.
- `apps/dashboard/src/pages/DashboardPage.tsx` — renderizar saúde e estados reais.
- `apps/dashboard/src/pages/SageIntegrationPage.tsx` — estado de normalização separado da coleta.
- `ecosystem.config.cjs` — política explícita de reinício.

### Task 1: Migration e invariantes duráveis

**Files:**
- Create: `apps/api/src/db/migrations/006_durable_worker.sql`
- Create: `apps/api/src/tests/durable-worker-migration.test.ts`
- Modify: `apps/api/src/tests/multi-company-migration.test.ts`

**Interfaces:**
- Consumes: tabelas `import_jobs`, `payroll_runs`, `notifications`, `companies` da migration 005.
- Produces: colunas de lease, `worker_heartbeats` e `notification_outbox` usadas pelas Tasks 2, 4 e 5.

- [ ] **Step 1: escrever o teste de contrato da migration**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(path.resolve('src/db/migrations/006_durable_worker.sql'), 'utf8');

describe('migration do worker durável', () => {
  it('cria lease, heartbeat, outbox e backfill compatível', () => {
    expect(sql).toContain('normalization_state');
    expect(sql).toContain('normalization_lease_until');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS worker_heartbeats');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS notification_outbox');
    expect(sql).toMatch(/normalized_at IS NOT NULL[\s\S]+COMPLETED/i);
    expect(sql).toMatch(/status='COMPLETED'[\s\S]+normalized_at IS NULL[\s\S]+PENDING/i);
  });
});
```

- [ ] **Step 2: executar o teste e confirmar falha por arquivo ausente**

Run: `npm test --workspace @payhub/api -- durable-worker-migration.test.ts`  
Expected: FAIL porque `006_durable_worker.sql` não existe.

- [ ] **Step 3: criar a migration aditiva**

```sql
ALTER TABLE import_jobs
  ADD COLUMN normalization_state ENUM('PENDING','CLAIMED','COMPLETED','FAILED') NULL AFTER normalized_at,
  ADD COLUMN normalization_owner VARCHAR(100) NULL AFTER normalization_state,
  ADD COLUMN normalization_claimed_at DATETIME NULL AFTER normalization_owner,
  ADD COLUMN normalization_lease_until DATETIME NULL AFTER normalization_claimed_at,
  ADD COLUMN normalization_attempt_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER normalization_lease_until,
  ADD COLUMN normalization_error VARCHAR(1000) NULL AFTER normalization_attempt_count,
  ADD KEY idx_import_jobs_normalization
    (job_type,status,normalization_state,normalization_lease_until,id);

UPDATE import_jobs
   SET normalization_state='COMPLETED'
 WHERE job_type='PAYROLL_IMPORT' AND normalized_at IS NOT NULL;

UPDATE import_jobs
   SET normalization_state='PENDING'
 WHERE job_type='PAYROLL_IMPORT' AND status='COMPLETED' AND normalized_at IS NULL;

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_name VARCHAR(80) NOT NULL,
  instance_id VARCHAR(100) NOT NULL,
  status ENUM('STARTING','RUNNING','STOPPING','ERROR') NOT NULL,
  phase ENUM('IDLE','CLAIMING','NORMALIZING','SCHEDULING','NOTIFYING') NOT NULL,
  current_job_id BIGINT UNSIGNED NULL,
  last_cycle_started_at DATETIME NULL,
  last_cycle_finished_at DATETIME NULL,
  last_heartbeat_at DATETIME NOT NULL,
  last_error VARCHAR(1000) NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (worker_name),
  KEY idx_worker_heartbeat_time (last_heartbeat_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  notification_id BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING','CLAIMED','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  owner VARCHAR(100) NULL,
  lease_until DATETIME NULL,
  next_attempt_at DATETIME NOT NULL,
  last_error VARCHAR(1000) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  sent_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_notification_outbox_notification (notification_id),
  KEY idx_notification_outbox_claim (status,next_attempt_at,lease_until,id),
  KEY idx_notification_outbox_company (company_id,status,id),
  CONSTRAINT fk_notification_outbox_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_notification_outbox_notification FOREIGN KEY (notification_id) REFERENCES notifications(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 4: executar testes da migration**

Run: `npm test --workspace @payhub/api -- durable-worker-migration.test.ts multi-company-migration.test.ts`  
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add apps/api/src/db/migrations/006_durable_worker.sql apps/api/src/tests/durable-worker-migration.test.ts apps/api/src/tests/multi-company-migration.test.ts
git commit -m "feat: add durable worker schema"
```

### Task 2: Claim, lease e falha terminal

**Files:**
- Create: `apps/api/src/services/normalization-queue.service.ts`
- Create: `apps/api/src/tests/normalization-queue.test.ts`

**Interfaces:**
- Consumes: colunas criadas na Task 1.
- Produces:
  - `claimNext(owner: string, leaseSeconds: number): Promise<NormalizationClaim | null>`
  - `renew(jobId: number, companyId: number, owner: string, leaseSeconds: number): Promise<void>`
  - `complete(claim: NormalizationClaim, result: NormalizationResult): Promise<void>`
  - `fail(claim: NormalizationClaim, error: unknown, maxAttempts: number): Promise<'PENDING'|'FAILED'>`

- [ ] **Step 1: escrever testes concorrentes e de lease**

Criar um fake SQL transacional que devolve um candidato e só concede o primeiro `UPDATE` condicional. Fixar estes casos:

```ts
it('concede um job a apenas um owner', async () => {
  const [a, b] = await Promise.all([queue.claimNext('worker-a', 900), queue.claimNext('worker-b', 900)]);
  expect([a, b].filter(Boolean)).toHaveLength(1);
});

it('retoma lease expirado e preserva lease ativo', async () => {
  expect(await queue.claimNext('worker-b', 900)).toMatchObject({ jobId: 12, companyId: 2 });
  expect(sql).toContain('normalization_lease_until < UTC_TIMESTAMP()');
});

it('renova lease com job, empresa e owner', async () => {
  await queue.renew(12, 2, 'worker-a', 900);
  expect(lastParams).toEqual([900, 12, 2, 'worker-a']);
});

it('torna a terceira falha terminal e conclui o run como FAILED', async () => {
  expect(await queue.fail(claimWithAttempt(3), new Error('quebra'), 3)).toBe('FAILED');
});
```

- [ ] **Step 2: executar e confirmar falha por módulo ausente**

Run: `npm test --workspace @payhub/api -- normalization-queue.test.ts`  
Expected: FAIL ao importar `NormalizationQueueService`.

- [ ] **Step 3: implementar o serviço com atualização condicional**

```ts
export type NormalizationClaim = {
  jobId: number;
  companyId: number;
  payrollRunId: number | null;
  owner: string;
  attempt: number;
};

export type NormalizationResult = {
  created: number;
  repaired: number;
  unchanged: number;
  skipped: number;
};

export class NormalizationQueueService {
  constructor(private pool: Pool) {}
  async claimNext(owner: string, leaseSeconds: number): Promise<NormalizationClaim | null>;
  async renew(jobId: number, companyId: number, owner: string, leaseSeconds: number): Promise<void>;
  async complete(claim: NormalizationClaim, result: NormalizationResult): Promise<void>;
  async fail(claim: NormalizationClaim, error: unknown, maxAttempts: number): Promise<'PENDING'|'FAILED'>;
}
```

Usar estas condições SQL no claim e na renovação:

```sql
SELECT id,company_id,payroll_run_id,normalization_attempt_count
  FROM import_jobs
 WHERE job_type='PAYROLL_IMPORT'
   AND status='COMPLETED'
   AND normalized_at IS NULL
   AND (
     normalization_state='PENDING'
     OR (normalization_state='CLAIMED' AND normalization_lease_until<UTC_TIMESTAMP())
   )
 ORDER BY id ASC
 LIMIT 1;

UPDATE import_jobs
   SET normalization_state='CLAIMED',
       normalization_owner=?,
       normalization_claimed_at=UTC_TIMESTAMP(),
       normalization_lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND),
       normalization_attempt_count=normalization_attempt_count+1,
       normalization_error=NULL,
       updated_at=UTC_TIMESTAMP()
 WHERE id=? AND company_id=? AND normalized_at IS NULL
   AND (
     normalization_state='PENDING'
     OR (normalization_state='CLAIMED' AND normalization_lease_until<UTC_TIMESTAMP())
   );

UPDATE import_jobs
   SET normalization_lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND),updated_at=UTC_TIMESTAMP()
 WHERE id=? AND company_id=? AND normalization_owner=? AND normalization_state='CLAIMED';
```

Se o claim afetar zero linhas, tentar o próximo ciclo. `complete` abre transação, marca job `COMPLETED`, preenche `normalized_at`, limpa owner/lease e conclui o run. `fail` sanitiza `String(error)` em 1000 caracteres; antes do limite volta a `PENDING`, no limite marca `FAILED` e atualiza o run na mesma transação. Todas as mutações exigem `id`, `company_id` e `normalization_owner`.

- [ ] **Step 4: executar teste e suíte de tenancy do worker**

Run: `npm test --workspace @payhub/api -- normalization-queue.test.ts worker-tenancy.test.ts`  
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add apps/api/src/services/normalization-queue.service.ts apps/api/src/tests/normalization-queue.test.ts
git commit -m "feat: add normalization leases"
```

### Task 3: Normalização idempotente e reparável

**Files:**
- Modify: `apps/api/src/services/payroll.service.ts`
- Create: `apps/api/src/tests/payroll-normalization-recovery.test.ts`

**Interfaces:**
- Consumes: `NormalizationClaim`, `NormalizationResult` e callback de renovação da Task 2.
- Produces: `normalizeClaimedJob(claim, renew): Promise<NormalizationResult>`.

- [ ] **Step 1: escrever testes de recuperação**

```ts
it('repara mesma versão PROCESSING sem criar nova versão', async () => {
  const result = await service.normalizeClaimedJob(claim, renew);
  expect(result).toMatchObject({ created: 0, repaired: 1 });
  expect(insertedPayrolls).toHaveLength(0);
  expect(updatedStatus).toBe('READY');
});

it('não altera holerite SIGNED com o mesmo hash', async () => {
  const result = await service.normalizeClaimedJob(claim, renew);
  expect(result.unchanged).toBe(1);
  expect(storageWrites).toHaveLength(0);
});

it('não deixa payroll atual visível se a transação falhar depois do arquivo', async () => {
  await expect(service.normalizeClaimedJob(claim, renew)).rejects.toThrow('falha controlada');
  expect(commits).toBe(0);
  expect(rollbacks).toBe(1);
});

it('renova o lease depois de cada documento', async () => {
  await service.normalizeClaimedJob(claim, renew);
  expect(renew).toHaveBeenCalledTimes(2);
});

it('audita divergência de empresa sem processar os dados do job', async () => {
  await expect(service.normalizeClaimedJob(crossCompanyClaim, renew)).rejects.toMatchObject({ code: 'JOB_COMPANY_MISMATCH' });
  expect(auditEvents).toContainEqual(expect.objectContaining({ action: 'PAYROLL_NORMALIZATION_FAILED', companyId: 2 }));
});
```

- [ ] **Step 2: executar e confirmar falha pela API inexistente**

Run: `npm test --workspace @payhub/api -- payroll-normalization-recovery.test.ts`  
Expected: FAIL porque `normalizeClaimedJob` e `repaired` ainda não existem.

- [ ] **Step 3: separar preparação e persistência**

Extrair funções privadas pequenas em `payroll.service.ts`:

```ts
private async loadJobInput(claim: NormalizationClaim): Promise<NormalizedPayroll[]>;
private async persistNormalizedPayroll(job: JobRow, payroll: NormalizedPayroll): Promise<'created'|'repaired'|'unchanged'>;
async normalizeClaimedJob(claim: NormalizationClaim, renew: () => Promise<void>): Promise<NormalizationResult>;
```

Gerar o PDF em memória antes da transação. Dentro da transação, revalidar empresa/hash/status, inserir ou reparar itens, gravar o arquivo, fazer upsert do documento, marcar `READY` e confirmar. Em erro, rollback; o arquivo eventualmente órfão não ganha referência no banco. Divergências de empresa registram auditoria `PAYROLL_NORMALIZATION_FAILED` com IDs técnicos, sem CPF ou payload Sage.

- [ ] **Step 4: manter adaptador legado temporário**

```ts
async normalizeCompletedJob(jobId: number): Promise<LegacyNormalizationResult> {
  const claim = await this.loadLegacyClaim(jobId);
  const result = await this.normalizeClaimedJob(claim, async () => undefined);
  return { created: result.created, unchanged: result.unchanged + result.repaired, skipped: result.skipped };
}
```

O adaptador preserva testes e chamadas existentes até a Task 5 migrar o worker.

- [ ] **Step 5: executar testes de normalização e PDF**

Run: `npm test --workspace @payhub/api -- payroll-normalization-recovery.test.ts normalizer.test.ts pdf.test.ts worker-tenancy.test.ts`  
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add apps/api/src/services/payroll.service.ts apps/api/src/tests/payroll-normalization-recovery.test.ts
git commit -m "fix: make payroll normalization recoverable"
```

### Task 4: Notificações internas e outbox Push

**Files:**
- Create: `apps/api/src/services/notification-outbox.service.ts`
- Create: `apps/api/src/tests/notification-outbox.test.ts`
- Modify: `apps/api/src/services/notification.service.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `notification_outbox` da Task 1.
- Produces:
  - `NotificationService.notifyRecipient()` grava notificação e outbox, sem rede;
  - `NotificationOutboxService.dispatch(owner, limit): Promise<OutboxDispatchResult>`.

- [ ] **Step 1: escrever testes de atomicidade e falha externa**

```ts
it('grava notificação e outbox na mesma transação', async () => {
  const id = await notifications.notifyEmployee(1, 8, input);
  expect(id).toBe(90);
  expect(transactionSql).toContain('INSERT IGNORE INTO notifications');
  expect(transactionSql).toContain('INSERT INTO notification_outbox');
  expect(sendNotification).not.toHaveBeenCalled();
});

it('não duplica outbox quando dedup_key já existe', async () => {
  expect(await notifications.notifyEmployee(1, 8, input)).toBeNull();
  expect(outboxInserts).toBe(0);
});

it('falha temporária agenda nova tentativa sem lançar para o ciclo', async () => {
  const result = await outbox.dispatch('worker-a', 20);
  expect(result).toMatchObject({ failed: 1 });
  expect(nextAttemptAt).not.toBeNull();
});
```

- [ ] **Step 2: executar e confirmar falhas**

Run: `npm test --workspace @payhub/api -- notification-outbox.test.ts worker-tenancy.test.ts`  
Expected: FAIL porque a notificação ainda envia Push diretamente e o serviço não existe.

- [ ] **Step 3: tornar persistência atômica e implementar dispatcher**

```ts
export type OutboxDispatchResult = { sent: number; failed: number; terminal: number };

export class NotificationOutboxService {
  constructor(private pool: Pool, private env: Env) {}
  async dispatch(owner: string, limit = 20): Promise<OutboxDispatchResult>;
}
```

Claim e transições usam exatamente:

```sql
SELECT id FROM notification_outbox
 WHERE (status='PENDING' AND next_attempt_at<=UTC_TIMESTAMP())
    OR (status='CLAIMED' AND lease_until<UTC_TIMESTAMP())
 ORDER BY id LIMIT ?;

UPDATE notification_outbox
   SET status='CLAIMED',owner=?,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 120 SECOND),
       attempt_count=attempt_count+1,updated_at=UTC_TIMESTAMP()
 WHERE id=? AND (status='PENDING' OR (status='CLAIMED' AND lease_until<UTC_TIMESTAMP()));
```

Para cada claim, carregar a notificação e suas assinaturas pela mesma `company_id`, respeitar `pushAllowed` e chamar `webpush.sendNotification` com `{ TTL: 86400, timeout: 10000 }`. Sucesso atualiza `SENT`, limpa lease e preenche `sent_at`. Falha usa `const delays = [1, 5, 15, 60]`; tentativas 1–4 retornam a `PENDING` com `next_attempt_at`, e a quinta marca `FAILED`. 404/410 remove `push_subscriptions` e marca a outbox como `SENT` porque não há destinatário válido restante.

- [ ] **Step 4: executar testes de notificações**

Run: `npm test --workspace @payhub/api -- notification-outbox.test.ts notification-policy.test.ts worker-tenancy.test.ts`  
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add apps/api/src/services/notification-outbox.service.ts apps/api/src/services/notification.service.ts apps/api/src/tests/notification-outbox.test.ts apps/api/src/app.ts
git commit -m "feat: deliver push notifications through outbox"
```

### Task 5: Runtime, heartbeat e watchdog

**Files:**
- Create: `apps/api/src/services/worker-heartbeat.service.ts`
- Create: `apps/api/src/worker/watchdog.ts`
- Create: `apps/api/src/tests/worker-watchdog.test.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/db/mysql.ts`
- Modify: `apps/api/src/worker/main.ts`
- Modify: `apps/api/src/tests/worker-tenancy.test.ts`
- Modify: `ecosystem.config.cjs`

**Interfaces:**
- Consumes: queue da Task 2, normalizador da Task 3 e outbox da Task 4.
- Produces: ciclo observável e processo fatalmente reiniciável.

- [ ] **Step 1: escrever testes do watchdog e ordem do ciclo**

```ts
it('aciona saída fatal quando o ciclo excede o prazo', async () => {
  vi.useFakeTimers();
  const exit = vi.fn();
  const watchdog = startWatchdog({ timeoutMs: 1000, snapshot: () => ({ phase: 'CLAIMING', jobId: 125 }), exit });
  await vi.advanceTimersByTimeAsync(1001);
  expect(exit).toHaveBeenCalledWith(1);
  watchdog.clear();
});

it('limpa watchdog depois de ciclo concluído', async () => {
  const watchdog = startWatchdog({ timeoutMs: 1000, snapshot, exit });
  watchdog.clear();
  await vi.advanceTimersByTimeAsync(1001);
  expect(exit).not.toHaveBeenCalled();
});

it('normaliza jobs reivindicados antes de agenda e outbox', async () => {
  await workerCycle(dependencies);
  expect(order).toEqual(['claim','normalize','schedule','alerts','outbox']);
});
```

- [ ] **Step 2: executar e confirmar falha**

Run: `npm test --workspace @payhub/api -- worker-watchdog.test.ts worker-tenancy.test.ts`  
Expected: FAIL porque não existem watchdog, heartbeat e novo contrato do ciclo.

- [ ] **Step 3: adicionar configurações**

```ts
WORKER_POLL_SECONDS: intish(20),
WORKER_CYCLE_TIMEOUT_SECONDS: intish(720),
WORKER_NORMALIZATION_LEASE_SECONDS: intish(900),
WORKER_NORMALIZATION_MAX_ATTEMPTS: intish(3),
WORKER_BATCH_SIZE: intish(20),
DB_CONNECT_TIMEOUT_MS: intish(10_000),
DB_QUEUE_LIMIT: intish(100),
```

No pool:

```ts
connectTimeout: env.DB_CONNECT_TIMEOUT_MS,
enableKeepAlive: true,
keepAliveInitialDelay: 0,
queueLimit: env.DB_QUEUE_LIMIT,
```

- [ ] **Step 4: implementar heartbeat e watchdog fatal**

```ts
export function startWatchdog(input: {
  timeoutMs: number;
  snapshot: () => { phase: string; jobId: number | null };
  exit?: (code: number) => never | void;
}): { clear(): void };

export class WorkerHeartbeatService {
  async update(input: WorkerHeartbeatUpdate): Promise<void>;
  async markError(instanceId: string, error: unknown): Promise<void>;
}
```

O callback padrão do watchdog usa `process.exit(1)`. Testes injetam `exit` para não encerrar o runner.

- [ ] **Step 5: reescrever o ciclo em fases explícitas**

```ts
export async function workerCycle(deps: WorkerDependencies, now = new Date()): Promise<WorkerCycleResult> {
  await deps.heartbeat.phase('CLAIMING');
  const normalized = await processClaimedJobs(deps);
  await deps.heartbeat.phase('SCHEDULING');
  const scheduled = await scheduleCompanyDue(deps.pool, deps.services, now);
  await deps.heartbeat.phase('NOTIFYING');
  await notifyCompanyOperationalAlerts(deps.pool, deps.services, deps.env.CONNECTOR_OFFLINE_SECONDS, now);
  const pushes = await deps.outbox.dispatch(deps.instanceId, deps.env.WORKER_BATCH_SIZE);
  await deps.heartbeat.idle();
  return { normalized, scheduled, pushes };
}
```

Cada job capturado chama `normalizeClaimedJob`; sucesso chama `queue.complete`; erro chama `queue.fail`; o loop continua para os demais jobs.

- [ ] **Step 6: configurar PM2 para recuperação explícita**

```js
{
  name: 'payhub-worker',
  cwd: __dirname,
  script: 'apps/api/dist/worker/main.js',
  restart_delay: 3000,
  min_uptime: '10s',
  max_restarts: 20,
  env: { NODE_ENV: 'production' }
}
```

- [ ] **Step 7: executar testes e build da API**

Run: `npm test --workspace @payhub/api -- worker-watchdog.test.ts worker-tenancy.test.ts normalization-queue.test.ts notification-outbox.test.ts`  
Expected: PASS.  
Run: `npm run build --workspace @payhub/api`  
Expected: exit 0.

- [ ] **Step 8: commit**

```bash
git add apps/api/src/config/env.ts apps/api/src/db/mysql.ts apps/api/src/services/worker-heartbeat.service.ts apps/api/src/worker/watchdog.ts apps/api/src/worker/main.ts apps/api/src/tests/worker-watchdog.test.ts apps/api/src/tests/worker-tenancy.test.ts ecosystem.config.cjs
git commit -m "feat: make payroll worker self recovering"
```

### Task 6: Estado real na API e dashboard

**Files:**
- Modify: `apps/api/src/services/connector.service.ts`
- Modify: `apps/api/src/routes/dashboard.routes.ts`
- Modify: `apps/api/src/app.test.ts`
- Create: `apps/dashboard/src/components/WorkerHealth.tsx`
- Create: `apps/dashboard/src/components/WorkerHealth.test.tsx`
- Modify: `apps/dashboard/src/pages/DashboardPage.tsx`
- Modify: `apps/dashboard/src/pages/SageIntegrationPage.tsx`

**Interfaces:**
- Consumes: heartbeat e campos de normalização.
- Produces: `workerHealth` no dashboard e campos `normalizationState` nos jobs.

- [ ] **Step 1: escrever testes da resposta e do componente**

```ts
it('reporta STALE quando heartbeat excede dois ciclos', async () => {
  const response = await request(app).get('/api/dashboard').set(authHeaders);
  expect(response.body.workerHealth).toMatchObject({ status: 'STALE', phase: 'NORMALIZING' });
});
```

```tsx
it('diferencia worker parado de conector online', () => {
  render(<WorkerHealth health={{ status:'STALE', phase:'NORMALIZING', lastHeartbeatAt:'2026-09-20T18:00:00Z' }}/>);
  expect(screen.getByText('Worker sem resposta')).toBeInTheDocument();
});
```

- [ ] **Step 2: executar e confirmar falhas**

Run: `npm test --workspace @payhub/api -- app.test.ts`  
Expected: FAIL sem `workerHealth`.  
Run: `npm test --workspace @payhub/dashboard -- WorkerHealth.test.tsx`  
Expected: FAIL por componente ausente.

- [ ] **Step 3: expor estado sanitizado**

Resposta:

```ts
workerHealth: {
  status: 'HEALTHY' | 'STALE' | 'OFFLINE' | 'ERROR';
  phase: 'IDLE' | 'CLAIMING' | 'NORMALIZING' | 'SCHEDULING' | 'NOTIFYING';
  currentJobId: number | null;
  lastHeartbeatAt: string | null;
}
```

Não retornar hostname, PID, instance ID ou erro SQL bruto ao frontend.

- [ ] **Step 4: atualizar labels dos jobs**

Mapeamento obrigatório:

```text
job RUNNING                         -> Coletando no Sage
job COMPLETED + normalization PENDING -> Aguardando processamento
normalization CLAIMED              -> Gerando holerite
normalization COMPLETED            -> Concluído
job FAILED                         -> Falha na coleta
normalization FAILED               -> Falha ao gerar holerite
```

- [ ] **Step 5: executar testes de API e dashboard**

Run: `npm test --workspace @payhub/api -- app.test.ts connector-tenancy.test.ts`  
Expected: PASS.  
Run: `npm test --workspace @payhub/dashboard -- WorkerHealth.test.tsx DashboardPage.test.tsx`  
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add apps/api/src/services/connector.service.ts apps/api/src/routes/dashboard.routes.ts apps/api/src/app.test.ts apps/dashboard/src/components/WorkerHealth.tsx apps/dashboard/src/components/WorkerHealth.test.tsx apps/dashboard/src/pages/DashboardPage.tsx apps/dashboard/src/pages/SageIntegrationPage.tsx
git commit -m "feat: expose worker health and normalization status"
```

### Task 7: Verificador e deploy seguro

**Files:**
- Create: `apps/api/src/scripts/verify-durable-worker.ts`
- Create: `apps/api/src/tests/verify-durable-worker.test.ts`
- Modify: `apps/api/src/scripts/verify-multi-company-migration.ts`
- Modify: `apps/api/package.json`
- Create: `DEPLOY-DURABLE-WORKER.md`

**Interfaces:**
- Consumes: tabelas e estados das Tasks 1–6.
- Produces: `npm run verify:durable-worker --workspace @payhub/api`.

- [ ] **Step 1: escrever teste dos invariantes**

```ts
it('falha para job concluído sem estado elegível', async () => {
  const checks = await verifyDurableWorker(fakePoolWithInvalidCompletedJob);
  expect(checks).toContainEqual(expect.objectContaining({ name: 'completed_jobs_without_normalization_state', ok: false }));
});

it('falha para heartbeat antigo e leases expirados não recuperados', async () => {
  const checks = await verifyDurableWorker(fakePoolWithStaleWorker);
  expect(checks.some((check) => !check.ok)).toBe(true);
});
```

- [ ] **Step 2: executar e confirmar falha**

Run: `npm test --workspace @payhub/api -- verify-durable-worker.test.ts`  
Expected: FAIL por módulo ausente.

- [ ] **Step 3: implementar verificações e script**

Verificações obrigatórias:

```text
payroll_jobs_without_normalization_state = 0
normalized_jobs_not_marked_completed = 0
claimed_jobs_without_owner_or_lease = 0
completed_runs_with_unfinished_jobs = 0
running_runs_with_terminal_jobs = 0
outbox_company_mismatch = 0
outbox_orphans = 0
current_ready_or_signed_payrolls_without_documents = 0
signed_payrolls_without_signed_document_hash = 0
worker_heartbeat_stale = 0
```

Adicionar ao package:

```json
"verify:durable-worker": "tsx src/scripts/verify-durable-worker.ts"
```

- [ ] **Step 4: escrever roteiro de deploy com comandos verificáveis**

O documento deve usar esta ordem:

```bash
cd /var/www/payhub
git pull --ff-only origin main
pm2 stop payhub-worker
npm ci
npm run db:migrate --workspace @payhub/api
npm run build --workspace @payhub/api
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
npm run verify:multi-company --workspace @payhub/api
npm run verify:durable-worker --workspace @payhub/api
pm2 describe payhub-worker
```

Incluir backup, rollback, confirmação de commit, PID novo, heartbeat e smoke test de busca individual.

- [ ] **Step 5: executar testes do verificador**

Run: `npm test --workspace @payhub/api -- verify-durable-worker.test.ts multi-company-migration.test.ts migration-runner.test.ts`  
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add apps/api/src/scripts/verify-durable-worker.ts apps/api/src/tests/verify-durable-worker.test.ts apps/api/src/scripts/verify-multi-company-migration.ts apps/api/package.json DEPLOY-DURABLE-WORKER.md
git commit -m "docs: add durable worker deployment checks"
```

### Task 8: Verificação integral e publicação

**Files:**
- Verify: entire repository
- Preserve: `PayHub.zip` unless explicitly requested otherwise

**Interfaces:**
- Consumes: todas as tarefas anteriores.
- Produces: commit final verificado e publicado em `origin/main`.

- [ ] **Step 1: executar suíte integral**

Run: `npm test`  
Expected: API, dashboard e mobile com zero falhas.

- [ ] **Step 2: executar build integral**

Run: `npm run build`  
Expected: TypeScript, Vite e export Android com exit 0.

- [ ] **Step 3: revisar alterações e segredos**

Run: `git diff --check`  
Expected: nenhuma falha.  
Run: `git status --short`  
Expected: apenas alterações planejadas e o `PayHub.zip` preexistente fora dos commits.  
Run: `rg -n "DB_PASSWORD=|VAPID_PRIVATE_KEY=|SIGNATURE_SEAL_SECRET=" --glob '!*.example' --glob '!PayHub.zip'`  
Expected: nenhum segredo versionado.

- [ ] **Step 4: conferir requisitos da especificação**

Confirmar por testes e diff:

```text
claim único
lease recuperável
normalização idempotente
reparo de PROCESSING/ERROR
Push fora do caminho crítico
watchdog fatal
heartbeat sanitizado
dashboard com estados distintos
verificadores e deploy documentado
isolamento por company_id
```

- [ ] **Step 5: criar commit de integração apenas se houver ajustes finais**

```bash
git add <somente-arquivos-planejados>
git commit -m "chore: finalize durable worker rollout"
```

- [ ] **Step 6: publicar**

Run: `git push origin main`  
Expected: `main -> main` sem rejeição.

- [ ] **Step 7: entregar instruções de produção**

Informar commit final, contagem de testes, resultado do build, arquivo de deploy e sequência de validação pós-deploy. Não declarar o incidente encerrado antes de o servidor mostrar heartbeat recente e a fila sem jobs concluídos pendentes além da tolerância.
