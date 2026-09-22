# PayHub 0.6.1 — leia antes de atualizar

Este é o pacote-fonte completo da versão **0.6.1 — Agenda Durável + Logs em Lote**. Ele inclui integralmente as funcionalidades da 0.6.0 (performance + verificação documental) e acrescenta a correção da busca automática por grupo.

Por segurança, o ZIP de entrega **não inclui `node_modules` nem artefatos `dist` pré-compilados**. O build deve ser feito no servidor com as dependências oficiais do projeto.

## Ordem obrigatória

1. Faça backup da aplicação, banco MySQL e storage documental.
2. Pare `payhub-worker` e `payhub-api` antes da troca final/migration.
3. Substitua o código, preservando `.env`, storage e configurações locais.
4. Execute `npm ci`.
5. Compile API e dashboard.
6. Execute `npm run db:migrate --workspace @payhub/api`.
   - vindo da **0.6.0**, deve aplicar a `008_durable_group_schedule_run_events.sql`;
   - vindo da **0.5.3**, deve aplicar primeiro a `007` e depois a `008`.
7. Suba API e worker com PM2.
8. Execute os quatro verificadores de produção.
9. Faça um teste de agenda em um grupo de homologação e confirme a timeline completa.

O hotfix de bootstrap PM2 do worker, já confirmado em produção na 0.5.3, permanece incorporado.

Consulte **DEPLOY-0.6.1.md** e **VALIDACAO-0.6.1.md** antes do deploy.
