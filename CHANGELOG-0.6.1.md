# PayHub 0.6.1 — Agenda Durável + Logs em Lote

## Objetivo

Esta versão fecha duas lacunas identificadas na busca automática de holerites por grupo da 0.6.0: a dependência do minuto exato de execução e a ausência de uma trilha completa no dashboard.

## Agenda durável

- O worker procura agendas **do dia atual que já venceram e ainda não foram enfileiradas**, em vez de exigir igualdade com o minuto corrente.
- A etapa `SCHEDULING` ocorre antes da normalização pesada em cada ciclo.
- `schedule_executions` passou a possuir estados `PENDING`, `CLAIMED`, `ENQUEUED` e `FAILED`.
- Claim de agenda com lease de 5 minutos permite recuperação após queda/restart do worker.
- Até 3 tentativas automáticas de enfileiramento por agenda/dia.
- `payroll_runs.schedule_execution_id` é único, evitando execução duplicada mesmo em retry concorrente ou recuperação após crash.
- A consulta de agendas ignora execuções já enfileiradas/terminais, evitando starvation quando existem muitos grupos agendados.

## Dias da semana

- Cada grupo pode escolher segunda, terça, quarta, quinta, sexta, sábado e/ou domingo.
- Grupos existentes recebem segunda a sexta por padrão (`weekdays_mask=31`).
- Todos os horários de um grupo compartilham o conjunto de dias escolhido.
- Ao editar o grupo, agendas antigas não são apagadas: os horários removidos são desabilitados, preservando `schedule_executions` históricos.

## Logs ponta a ponta

Nova tabela `payroll_run_events` registra a timeline da execução:

- `SCHEDULE_ENQUEUED` / `RUN_ENQUEUED`;
- `CONNECTOR_CLAIMED`;
- logs emitidos pelo Connector Sage;
- `COLLECTION_COMPLETED` / `COLLECTION_FAILED`;
- `NORMALIZATION_STARTED`;
- `NORMALIZATION_RETRY` / `NORMALIZATION_FAILED`;
- `RUN_COMPLETED` / `RUN_PARTIAL`.

A timeline é observabilidade e foi tornada **não bloqueante**: uma falha ao registrar log nunca impede claim, coleta, criação do job ou geração do holerite.

## Dashboard

- Cards de grupos exibem dias/horários da automação.
- Exibe última execução, situação, quantidade processada, falhas e duração.
- Exibe próxima execução calculada em `America/Sao_Paulo`.
- Novo modal **Execuções e logs** com histórico recente e timeline detalhada.
- Logs do job na Integração Sage passam a mesclar logs do conector com os eventos PayHub da mesma execução.
- Dashboard diferencia busca `Automática em lote`, `Manual em lote` e `Individual`.

## Banco

Migration nova: `008_durable_group_schedule_run_events.sql`.

Principais alterações:

- `group_schedules.weekdays_mask`;
- estado/claim/retry em `schedule_executions`;
- `payroll_runs.schedule_execution_id` com índice UNIQUE;
- tabela `payroll_run_events` com chave de deduplicação por execução.

## Verificação operacional

Novo comando:

```bash
npm run verify:group-scheduling --workspace @payhub/api
```

Ele valida agendas sem dias, execuções enfileiradas sem run, vínculos inconsistentes, runs agendados sem job/timeline e claims vencidos.
