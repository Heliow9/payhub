# PayHub — implantação do worker durável de holerites

Este pacote corrige o cenário em que a coleta do Sage termina, porém a busca permanece em **“Em execução”** porque a etapa de geração/normalização de holerites não chega a uma finalização durável.

## O que muda

- `import_jobs` passa a possuir estado próprio de normalização (`PENDING`, `CLAIMED`, `COMPLETED`, `FAILED`).
- O worker faz **claim com lease**. Se o processo cair, o lease expira e outro ciclo pode retomar o job.
- A normalização é idempotente: o mesmo hash não cria cópia; registros `PROCESSING`/`ERROR` ou PDF ausente/corrompido são reparados.
- Holerites `SIGNED` não são rebaixados nem regenerados.
- A conclusão do job e do `payroll_run` ocorre na mesma transação.
- Push saiu do caminho crítico e é entregue pela `notification_outbox` com retentativa.
- O worker grava heartbeat e possui watchdog fatal; o PM2 reinicia processos que ficarem presos.
- Dashboard e Integração Sage passam a distinguir coleta, fila, geração, falha e saúde do worker.

## 1. Antes do deploy

No servidor, entre na raiz real do PayHub e confirme o repositório/commit:

```bash
cd /var/www/payhub
git status --short --branch
git rev-parse --show-toplevel
git rev-parse HEAD
```

Faça backup do banco e da pasta de documentos antes da migration. Exemplo — ajuste host, usuário, banco e caminho aos valores do seu ambiente:

```bash
mkdir -p ~/payhub-backups
mysqldump -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p "$DB_NAME" \
  > ~/payhub-backups/payhub-before-durable-worker-$(date +%Y%m%d-%H%M%S).sql

tar -czf ~/payhub-backups/payhub-storage-$(date +%Y%m%d-%H%M%S).tgz "$DOCUMENT_STORAGE_PATH"
```

Não coloque senha do banco na linha de comando, em commit ou em print.

## 2. Sequência obrigatória de implantação

A ordem é importante: **pare o worker antes da migration e só reinicie depois de instalar, migrar e compilar.**

```bash
cd /var/www/payhub

git pull --ff-only origin main

git rev-parse HEAD

pm2 stop payhub-worker

npm ci
npm run db:migrate --workspace @payhub/api
npm run build --workspace @payhub/api
npm run build --workspace @payhub/dashboard

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save

npm run verify:multi-company --workspace @payhub/api
npm run verify:durable-worker --workspace @payhub/api

pm2 describe payhub-worker
pm2 status
```

A migration `006_durable_worker.sql` transforma automaticamente jobs `PAYROLL_IMPORT` já coletados com `status='COMPLETED'` e `normalized_at IS NULL` em `PENDING`. Assim, os processamentos que ficaram presos **antes da geração dos holerites** entram novamente na fila do novo worker sem precisar criar outra busca.

## 3. Variáveis do worker

Os defaults já existem no código; podem ser explicitados no `.env`:

```dotenv
WORKER_POLL_SECONDS=20
WORKER_CYCLE_TIMEOUT_SECONDS=720
WORKER_NORMALIZATION_LEASE_SECONDS=900
WORKER_NORMALIZATION_MAX_ATTEMPTS=3
WORKER_BATCH_SIZE=20
DB_CONNECT_TIMEOUT_MS=10000
DB_QUEUE_LIMIT=100
```

Mantenha `WORKER_CYCLE_TIMEOUT_SECONDS` menor que `WORKER_NORMALIZATION_LEASE_SECONDS`, como nos valores acima. Isso faz o watchdog encerrar um ciclo travado antes de o lease ficar disponível para outra instância.

## 4. Verificação após o restart

Acompanhe o worker por alguns minutos:

```bash
pm2 logs payhub-worker --lines 200
```

O verificador deve terminar somente com `OK`:

```bash
npm run verify:durable-worker --workspace @payhub/api
```

Ele valida, entre outros pontos:

- jobs concluídos sem estado de normalização elegível;
- jobs normalizados sem estado `COMPLETED`;
- claims sem owner/lease;
- runs concluídos com job ainda incompleto;
- runs `RUNNING` ligados a job terminal;
- PDFs utilizáveis sem evidência do documento;
- assinados sem hash/documento assinado;
- divergência/orfandade da outbox;
- heartbeat ausente ou antigo.

No dashboard, confirme que a saúde do worker aparece como **Worker operacional**. Durante um processamento, a fase pode aparecer como **Gerando holerites** e deve retornar a ocioso após a conclusão.

## 5. Smoke test obrigatório

Faça uma **Busca individual** de um funcionário de teste e acompanhe o fluxo:

```text
Coletando no Sage
→ Aguardando processamento
→ Gerando holerite
→ Concluído
```

Depois confira:

1. o run saiu de `Em execução`;
2. o holerite foi criado/reparado e abre normalmente;
3. o job possui `normalization_state='COMPLETED'` e `normalized_at` preenchido;
4. o heartbeat continua recente após o processamento;
5. `npm run verify:durable-worker --workspace @payhub/api` continua com zero falhas.

Para diagnóstico SQL de um run específico:

```sql
SELECT
  r.id run_id,r.company_id,r.status run_status,r.employee_count,r.success_count,r.failure_count,r.message,
  j.id job_id,j.status job_status,j.normalization_state,j.normalization_attempt_count,
  j.normalization_owner,j.normalization_lease_until,j.normalization_error,j.normalized_at,j.updated_at
FROM payroll_runs r
LEFT JOIN import_jobs j
  ON j.payroll_run_id=r.id AND j.company_id=r.company_id AND j.job_type='PAYROLL_IMPORT'
WHERE r.id=<RUN_ID>;
```

## 6. Caso o verificador encontre run legado inconsistente

Não altere status manualmente sem identificar primeiro o estado do job. Um caso legado raro é o job já possuir `normalized_at`, mas o `payroll_run` ainda estar `RUNNING` por uma interrupção da versão antiga exatamente entre essas duas gravações. O verificador acusa isso em `running_runs_with_terminal_job`.

Nessa situação, preserve os dados e investigue o run/job antes de qualquer correção. O novo fluxo não cria essa janela porque finaliza job + run dentro da mesma transação.

## 7. Rollback

Se o build, migration ou verificadores falharem:

```bash
pm2 stop payhub-worker payhub-api

git log --oneline -n 5
git checkout <COMMIT_ANTERIOR_ESTAVEL>
npm ci
npm run build --workspace @payhub/api
npm run build --workspace @payhub/dashboard
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

**Atenção:** a migration 006 é aditiva. Não remova colunas/tabelas no impulso. Em incidente, mantenha o schema novo, restaure o código estável e, se houver necessidade de restaurar dados, use o dump feito antes da implantação em uma janela controlada.

## Critério para encerrar o incidente

Não considere o problema resolvido apenas porque o PM2 mostra `online`. O incidente só está tecnicamente validado quando houver **heartbeat recente**, fila sem jobs concluídos pendentes além da tolerância, verificador durável sem falhas e um smoke test real concluindo do início ao fim.
