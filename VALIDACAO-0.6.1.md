# Validação — PayHub 0.6.1

## Validações concluídas no empacotamento

- Versões do root, API, Dashboard, Mobile e `VERSION` alinhadas em `0.6.1`.
- Migration `008_durable_group_schedule_run_events.sql` revisada para:
  - dias da semana;
  - claim/lease/retry;
  - vínculo idempotente `schedule_execution_id`;
  - timeline `payroll_run_events`;
  - backfill do histórico recente.
- Scheduler revisado para usar `run_time <= horário atual` no mesmo dia, com filtro de dia da semana.
- Scheduler filtra execuções já enfileiradas/terminais antes do limite da consulta, evitando starvation de agendas posteriores.
- `SCHEDULING` ocorre antes de `CLAIMING/NORMALIZING` em cada ciclo durável.
- Edição de grupo preserva os IDs dos horários existentes.
- Registro da timeline é não bloqueante nos pontos críticos do Connector, PayrollRunService e Worker.
- Rotas de histórico/timeline e integração com logs do Connector revisadas.
- UI de grupos revisada para dias, última execução, próxima execução e modal de timeline.
- Script `verify:group-scheduling` incluído.
- **221 arquivos TS/TSX** analisados por parser TypeScript: **0 erros de parsing/transpile**.
- Integridade do ZIP e SHA-256 são gerados após a limpeza final do pacote.

## Testes que devem ser executados no servidor

O ambiente de empacotamento não conseguiu acessar `registry.npmjs.org` (`EAI_AGAIN`). Por isso não foi possível concluir `npm ci`, `vitest` nem o build TypeScript/Vite com todas as dependências reais.

A tentativa de build local falhou exclusivamente por módulos/declarations ausentes no `node_modules` incompleto do ambiente (Express, MySQL2, Zod, CORS, Helmet etc.). O pacote final não leva esse `node_modules` parcial.

No servidor, execute obrigatoriamente:

```bash
npm ci
npm run build --workspace @payhub/api
npm run build --workspace @payhub/dashboard
npm run test --workspace @payhub/api
npm run verify:multi-company --workspace @payhub/api
npm run verify:durable-worker --workspace @payhub/api
npm run verify:document-performance --workspace @payhub/api
npm run verify:group-scheduling --workspace @payhub/api
```

Depois faça o smoke test descrito em `DEPLOY-0.6.1.md`.

## Critério de liberação

A versão deve ser considerada liberada no servidor apenas quando:

1. API e Dashboard compilarem sem erro;
2. migration 008 for aplicada com sucesso;
3. todos os verificadores retornarem `OK`;
4. uma busca automática por grupo produzir timeline ponta a ponta;
5. uma agenda perdida no minuto exato for recuperada no mesmo dia sem duplicar a execução.
