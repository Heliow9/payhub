# PayHub 0.6.1 — Deploy de Agenda Durável + Logs em Lote

## Escopo

A 0.6.1 contém tudo da 0.6.0 e adiciona:

- recuperação de agenda vencida no mesmo dia, sem depender do minuto exato;
- claim/lease/retry idempotente para busca automática por grupo;
- seleção de dias da semana;
- histórico de agendas preservado ao editar o grupo;
- timeline ponta a ponta da execução em lote;
- visualização de última/próxima execução, duração e logs no dashboard;
- novo verificador de consistência de agendas.

## 1. Backup obrigatório

```bash
cd /var/www
sudo tar -czf payhub-pre-0.6.1-$(date +%Y%m%d-%H%M%S).tar.gz payhub
```

Faça também backup do banco `pay_hub` pelo mecanismo do provedor e confirme backup do diretório apontado por `DOCUMENT_STORAGE_PATH`.

## 2. Pare PayHub durante a troca final

```bash
cd /var/www/payhub
pm2 stop payhub-worker
pm2 stop payhub-api
```

Não execute a migration 008 com o worker antigo ativo.

## 3. Atualize o código

Substitua os arquivos pelo pacote 0.6.1, preservando:

- `.env`;
- storage documental;
- configurações locais não versionadas;
- `connector/PayHub.SageConnector/appsettings.json` no Windows.

Confirme:

```bash
cat VERSION
```

Esperado:

```text
0.6.1
```

## 4. Instale dependências e compile

```bash
cd /var/www/payhub
rm -rf apps/api/dist apps/dashboard/dist
npm ci
npm run build --workspace @payhub/api
npm run build --workspace @payhub/dashboard

test -f apps/api/dist/server.js
test -f apps/api/dist/worker/main.js
test -f apps/dashboard/dist/index.html
```

Se qualquer comando falhar, **não reinicie a produção com build parcial**.

## 5. Execute as migrations

```bash
npm run db:migrate --workspace @payhub/api
```

### Se o servidor já estiver em 0.6.0

Esperado:

```text
skip 007_performance_document_verification.sql
applied 008_durable_group_schedule_run_events.sql
```

### Se o servidor ainda estiver em 0.5.3

Esperado:

```text
applied 007_performance_document_verification.sql
applied 008_durable_group_schedule_run_events.sql
```

A `008` adiciona os dias de agenda, claim/lease/retry, vínculo idempotente com `payroll_runs` e a tabela `payroll_run_events`.

## 6. Suba API e worker

```bash
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
sleep 10
pm2 status
```

`payhub-api` e `payhub-worker` devem estar `online`.

Confirme o bootstrap do worker:

```bash
tail -n 30 ~/.pm2/logs/payhub-worker-out.log
```

Deve existir linha semelhante a:

```text
PayHub Worker iniciado (host-pid-instance).
```

## 7. Verificadores obrigatórios

```bash
npm run verify:multi-company --workspace @payhub/api
npm run verify:durable-worker --workspace @payhub/api
npm run verify:document-performance --workspace @payhub/api
npm run verify:group-scheduling --workspace @payhub/api
```

Todos os itens devem retornar `OK`.

## 8. Smoke test da busca automática por grupo

Use um grupo de teste/homologação.

1. Abra **Grupos** e configure um horário alguns minutos à frente.
2. Selecione explicitamente o dia da semana atual.
3. Aguarde o horário.
4. Confirme que o card mostra a execução e a próxima agenda.
5. Abra **Execuções e logs**.
6. A timeline deve mostrar, conforme o processamento avança:
   - enfileiramento automático;
   - claim pelo Connector Sage;
   - logs de leitura/coleta;
   - coleta concluída;
   - normalização/geração iniciada;
   - resultado final ou retentativa/falha.
7. Abra **Integração Sage > Logs** do mesmo job e confirme a trilha combinada.

### Teste específico da agenda durável

Para provar que a execução não depende mais do minuto exato, configure um horário e deixe o worker parado durante aquele minuto:

```bash
pm2 stop payhub-worker
```

Depois do horário, ainda no mesmo dia, inicie novamente:

```bash
pm2 start payhub-worker
```

A agenda vencida deve ser detectada e enfileirada uma única vez. Em seguida rode:

```bash
npm run verify:group-scheduling --workspace @payhub/api
```

## 9. Observações de idempotência

- A combinação histórica `schedule_id + run_date` continua única.
- Cada `schedule_execution_id` pode possuir apenas um `payroll_run`.
- Reinício do worker após criação parcial do run/job reaproveita a execução já criada.
- Claims vencidos podem ser retomados.
- Após 3 falhas de enfileiramento, a agenda fica `FAILED` e é exibida no grupo para diagnóstico.
- Eventos da timeline têm chave de deduplicação e não bloqueiam o processamento se o registro de observabilidade falhar.

## 10. Connector Sage

A 0.6.1 não exige uma versão nova do Connector além da **3.2.0** já incluída na 0.6.0. Se o Connector 3.2.0 ainda não foi publicado no Windows, siga a seção correspondente de `DEPLOY-0.6.0.md` para obter todo o ganho de performance.

## Rollback

Não tente remover manualmente colunas/tabelas da migration 008 depois que execuções 0.6.1 forem registradas.

Para rollback estrutural seguro, restaure **banco + aplicação** do mesmo backup. Um rollback apenas do código para 0.6.0 deixa o schema 008 adicional no banco; embora colunas extras não sejam destrutivas, o caminho homologado é restaurar o par consistente.
