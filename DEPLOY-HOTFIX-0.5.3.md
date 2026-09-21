# PayHub 0.5.3 — Hotfix do processamento durável de holerites

Esta versão corrige buscas de holerites que permaneciam em **Em execução** após o conector Sage concluir a coleta.

## Principais correções

- worker de normalização com claim, lease, heartbeat e retomada após falha/restart;
- backfill dos jobs de folha já coletados e ainda não normalizados;
- conclusão transacional de `import_jobs` + `payroll_runs`;
- até 3 tentativas de normalização antes de falha terminal;
- reparo automático de holerite `PROCESSING`/`ERROR`, PDF ausente ou hash divergente;
- proteção de holerites `SIGNED`;
- Push desacoplado por outbox para não bloquear a geração do PDF;
- watchdog do worker + reinício pelo PM2;
- dashboard passa a mostrar `Coletando no Sage`, `Aguardando processamento`, `Gerando holerite`, `Finalizando`, `Concluído` ou a falha correspondente;
- verificador `verify:durable-worker` e saúde do worker.

## Implantação

Use o procedimento completo em `DEPLOY-DURABLE-WORKER.md`. A sequência essencial é:

```bash
pm2 stop payhub-worker
npm ci
npm run db:migrate --workspace @payhub/api
npm run build --workspace @payhub/api
npm run build --workspace @payhub/dashboard
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
npm run verify:multi-company --workspace @payhub/api
npm run verify:durable-worker --workspace @payhub/api
```

Depois faça uma busca individual real e confirme que o fluxo sai de coleta/fila/geração e termina em `Concluído`.
