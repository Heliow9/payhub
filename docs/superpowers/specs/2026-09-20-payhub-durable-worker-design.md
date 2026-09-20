# PayHub — Worker Durável e Recuperável

**Data:** 2026-09-20  
**Status:** Aguardando aprovação para planejamento  
**Escopo:** Tornar a normalização de holerites durável, recuperável e observável usando o MySQL existente, sem Redis e sem alterar o isolamento multiempresa.

## 1. Contexto e objetivo

O conector Sage conclui corretamente os jobs e grava os lotes brutos, mas o processo responsável por transformar esses lotes em holerites pode permanecer vivo no PM2 e, ao mesmo tempo, deixar de avançar. Nesse estado, `import_jobs.status` fica como `COMPLETED`, `normalized_at` permanece nulo e o `payroll_run` continua como `RUNNING 0/N`.

A execução manual da mesma normalização, usando um pool MySQL novo, conclui os jobs. Isso demonstra que os dados brutos e a regra de normalização estão funcionais. O problema está no ciclo de vida do worker de longa duração: qualquer `await` que não resolva paralisa o único loop, não existe lease de processamento, o pool aceita espera indefinida por conexão e o PM2 considera o processo saudável apenas porque ele continua vivo.

O objetivo desta mudança é garantir que:

- todo job Sage concluído chegue a um estado terminal de normalização;
- uma conexão, notificação ou operação travada não paralise a fila indefinidamente;
- reinícios sejam seguros e retomem trabalho incompleto;
- somente um worker normalize determinado job por vez;
- o dashboard mostre a diferença entre coleta Sage e geração do holerite;
- o estado real do worker possa ser diagnosticado sem executar scripts manuais;
- empresas continuem rigorosamente isoladas por `company_id`;
- os dados e documentos atuais da RealEnergy permaneçam intactos.

## 2. Alternativas consideradas

### 2.1 Apenas watchdog

Reiniciar o processo quando um ciclo ultrapassar determinado tempo resolveria o travamento aparente, mas poderia interromper uma gravação parcial e não impediria dois processos de trabalhar no mesmo job. Foi rejeitado como solução isolada.

### 2.2 Fila durável no MySQL

O MySQL já é a fonte de verdade do PayHub. A solução escolhida acrescenta lease, tentativas, recuperação, heartbeat e uma outbox de notificações às tabelas existentes. Ela não exige infraestrutura nova e atende ao volume atual.

### 2.3 Redis/BullMQ

Uma fila externa facilitaria concorrência e retentativas, mas exigiria outro serviço, persistência, backup e monitoramento. Foi descartada nesta etapa por aumentar a superfície operacional sem necessidade comprovada.

## 3. Princípios da solução

1. O banco é a fonte de verdade da fila.
2. Processamento precisa ser idempotente e retomável.
3. Um job precisa ter um proprietário temporário, nunca permanente.
4. Estado empresarial sempre vem do job persistido.
5. Notificação não participa do caminho crítico do holerite.
6. PM2 `online` não significa worker saudável; heartbeat é obrigatório.
7. Timeout encerra o processo, em vez de deixar operações antigas acumularem em segundo plano.
8. Migrações são aditivas e preservam IDs, hashes e documentos existentes.

## 4. Modelo de dados

Criar a migration `006_durable_worker.sql`.

### 4.1 Lease de normalização

Adicionar a `import_jobs`:

```text
normalization_state          PENDING | CLAIMED | COMPLETED | FAILED, nullable
normalization_owner          varchar(100), nullable
normalization_claimed_at     datetime, nullable
normalization_lease_until    datetime, nullable
normalization_attempt_count  int unsigned, default 0
normalization_error          varchar(1000), nullable
```

Regras:

- campos são usados somente por `PAYROLL_IMPORT`;
- job de folha já normalizado recebe `COMPLETED` no backfill;
- job de folha com coleta concluída e `normalized_at IS NULL` recebe `PENDING`;
- jobs de diagnóstico permanecem com estado de normalização nulo;
- `normalized_at` continua existindo para compatibilidade e só é preenchido junto da conclusão;
- índice de seleção: `(job_type, status, normalization_state, normalization_lease_until, id)`.

Um claim é obtido por atualização condicional. O worker primeiro identifica um candidato e depois executa um `UPDATE` que só tem sucesso se o job continuar pendente ou com lease expirado. `affectedRows = 1` concede o claim; zero significa que outro worker venceu a disputa.

O lease padrão será de 15 minutos e será renovado após cada holerite concluído. O identificador do proprietário combinará hostname, PID e UUID iniciado com o processo.

### 4.2 Heartbeat

Criar `worker_heartbeats`:

```text
worker_name                 primary key
instance_id                 varchar(100)
status                      STARTING | RUNNING | STOPPING | ERROR
phase                       IDLE | CLAIMING | NORMALIZING | SCHEDULING | NOTIFYING
current_job_id              bigint, nullable
last_cycle_started_at       datetime, nullable
last_cycle_finished_at      datetime, nullable
last_heartbeat_at           datetime
last_error                  varchar(1000), nullable
updated_at                  datetime
```

O worker atualiza o heartbeat no começo e fim de cada fase. Um heartbeat com mais de dois intervalos de ciclo será considerado atrasado; após o limite operacional configurado será considerado offline.

### 4.3 Outbox de Push

Criar `notification_outbox`:

```text
id                          bigint primary key
company_id                  bigint
notification_id             bigint unique
status                      PENDING | CLAIMED | SENT | FAILED
attempt_count               int unsigned
owner                       varchar(100), nullable
lease_until                 datetime, nullable
next_attempt_at             datetime
last_error                  varchar(1000), nullable
created_at                  datetime
updated_at                  datetime
sent_at                     datetime, nullable
```

A notificação interna e seu registro de outbox serão criados na mesma transação. Chamadas de domínio não aguardarão rede Web Push. O dispatcher consulta as assinaturas apenas quando processa a outbox.

Falhas temporárias usam retentativa com espera progressiva. Respostas 404/410 removem a assinatura inválida e concluem a entrega. Após cinco tentativas, a entrega fica `FAILED`, sem alterar o holerite ou o run.

## 5. Ciclo do worker

Cada ciclo executará nesta ordem:

```text
heartbeat: CLAIMING
→ recuperar leases expirados
→ reivindicar e normalizar até 20 jobs
→ heartbeat: SCHEDULING
→ criar buscas automáticas vencidas
→ heartbeat: NOTIFYING
→ registrar alertas operacionais internos
→ despachar lote limitado da outbox Push
→ heartbeat: IDLE
```

O ciclo não manterá um job reivindicado enquanto executa alertas ou agendamentos.

### 5.1 Watchdog

O processo terá um watchdog global configurável, inicialmente em 12 minutos. Se o ciclo não terminar nesse prazo:

1. grava no stderr a fase, o job e a duração;
2. tenta registrar `ERROR` no heartbeat com um prazo curto;
3. encerra com código diferente de zero;
4. o PM2 inicia uma instância nova após pequeno `restart_delay`.

O processo será encerrado de fato. Não será usado apenas `Promise.race`, pois isso deixaria a operação travada ocupando conexão em segundo plano.

### 5.2 Banco de dados

O pool passa a configurar explicitamente:

- `connectTimeout`;
- TCP keep-alive;
- limite finito de fila para aquisição de conexão;
- logging sanitizado de erros de conexão.

O watchdog continua sendo a proteção final para consultas que não retornem. Senha, token e payload bruto nunca serão registrados.

## 6. Normalização retomável

### 6.1 Unidade de trabalho

Cada holerite normalizado é uma unidade recuperável. Para um novo documento:

1. calcular dados, itens, resumo, hash e PDF em memória;
2. iniciar transação;
3. validar novamente o job, empresa, lease e funcionário;
4. desativar versão corrente somente se uma nova versão for necessária;
5. inserir ou reparar o registro do holerite e seus itens;
6. gravar o arquivo no caminho empresarial;
7. inserir ou atualizar `payroll_documents`;
8. marcar o holerite como `READY`;
9. confirmar a transação;
10. renovar o lease do job.

Se a transação for desfeita depois da gravação do arquivo, poderá existir um arquivo órfão, mas nunca um holerite atual sem documento. Arquivos órfãos poderão ser removidos por rotina administrativa posterior e não aparecem para usuários.

### 6.2 Retomada por hash

Ao reencontrar o mesmo `source_hash`:

- holerite terminal com documento íntegro: contar como `unchanged`;
- holerite `PROCESSING` ou `ERROR`, ou sem `payroll_documents`: reparar a mesma versão;
- documento cujo hash não corresponda ao banco: marcar erro e reconstruir antes de concluir o job;
- holerite assinado nunca será rebaixado ou sobrescrito.

### 6.3 Conclusão do job

O job só recebe `normalization_state = COMPLETED`, `normalized_at` e limpeza do lease depois de todas as unidades terminarem. O `payroll_run` é atualizado na mesma transação final.

Falhas incrementam `normalization_attempt_count`, armazenam mensagem sanitizada e liberam o lease. Até três tentativas deixam o job novamente `PENDING`. Na terceira falha:

- o job recebe `normalization_state = FAILED`;
- o run recebe `FAILED` ou `PARTIAL`, conforme documentos já concluídos;
- o dashboard exibe o erro e a possibilidade de reprocessamento administrativo;
- outras empresas e outros jobs continuam sendo processados.

## 7. Concorrência e multiempresa

- dois workers podem existir durante reload sem duplicar processamento;
- todas as operações do job usam seu `company_id` persistido;
- batches são lidos por `(job_id, company_id)`;
- funcionários são resolvidos por `(company_id, sage_employee_code)`;
- payroll, run, heartbeat do job e notificações mantêm o mesmo `company_id`;
- um erro de vínculo cruzado encerra aquele job e é auditado;
- nenhum `company_id` fornecido pelo cliente substitui o contexto persistido.

## 8. API e dashboard

A listagem de jobs passará a retornar:

```text
normalizationState
normalizationAttemptCount
normalizationError
normalizationClaimedAt
normalizationLeaseUntil
```

O painel distinguirá:

- `Coletando no Sage`;
- `Aguardando processamento`;
- `Gerando holerite`;
- `Concluído`;
- `Falha na coleta`;
- `Falha ao gerar holerite`.

O dashboard administrativo exibirá a saúde do worker com último heartbeat e fase. A rota será autenticada e filtrada ao contexto administrativo; informações de infraestrutura sensíveis não serão retornadas.

O run não permanecerá `RUNNING` quando o job atingir falha terminal de normalização.

## 9. Implantação e compatibilidade

1. Fazer backup do banco e armazenamento.
2. Parar apenas `payhub-worker`; a API antiga permanece disponível.
3. Aplicar a migration aditiva `006` e conferir o backfill; a API antiga ignora as estruturas novas.
4. Atualizar o código e instalar dependências bloqueadas pelo lockfile.
5. Compilar a API.
6. Iniciar/recarregar API e worker pelo arquivo do PM2.
7. Confirmar novo PID, uptime recente e heartbeat `RUNNING/IDLE`.
8. Aguardar o worker reivindicar jobs antigos com `normalized_at IS NULL`.
9. Executar verificador de invariantes e smoke test com uma busca individual.
10. Salvar a configuração PM2.

Jobs 123, 124 e outros já normalizados permanecem concluídos. Jobs atualmente parados, como os observados após a implantação multiempresa, serão colocados em `PENDING` pelo backfill e retomados. Nenhum PDF assinado será regenerado.

O rollback de código mantém as colunas e tabelas aditivas. O código anterior continuará reconhecendo `status` e `normalized_at`; contudo, após ativar múltiplos workers, o rollback deverá manter somente uma instância antiga para evitar concorrência sem lease.

## 10. Observabilidade e operação

Logs estruturados mínimos:

```text
worker_started instanceId
cycle_started
phase_started phase
job_claimed jobId companyId attempt
job_completed jobId created unchanged repaired skipped durationMs
job_failed jobId attempt code durationMs
phase_completed phase durationMs
cycle_completed durationMs
watchdog_timeout phase jobId durationMs
```

Não registrar CPF, PIN, senha, tokens, conteúdo de folha ou payloads brutos.

O roteiro de deploy deve validar automaticamente:

- commit atual;
- timestamp do build;
- PID e uptime após reload;
- heartbeat recente;
- ausência de jobs concluídos aguardando normalização além da tolerância.

## 11. Estratégia de testes

### 11.1 Unidade

- somente um de dois workers obtém o claim;
- lease expirado volta a ser elegível;
- lease ativo de outra instância não é tomado;
- timeout do ciclo encerra com falha controlada;
- Web Push não bloqueia conclusão do holerite;
- backoff e limite da outbox;
- erro de empresa cruzada encerra apenas o job afetado.

### 11.2 Recuperação

- interrupção antes da transação não cria dados;
- interrupção durante transação causa rollback;
- arquivo órfão não aparece no sistema;
- registro `PROCESSING` com mesmo hash é reparado;
- documento ausente ou hash divergente é reconstruído;
- documento assinado não é alterado;
- job retomado conclui o run uma única vez.

### 11.3 Integração

- conector conclui job, worker cria PDF e run termina;
- processo reinicia entre dois funcionários e retoma o restante;
- notificação externa indisponível não atrasa a fila principal;
- pool MySQL interrompido faz o watchdog reiniciar a instância;
- duas empresas processam jobs sem vazamento ou bloqueio cruzado;
- dois workers temporários não geram versões duplicadas.

### 11.4 Regressão

- suíte atual completa da API, dashboard e mobile;
- verificador multiempresa;
- build de produção;
- smoke test da RealEnergy: busca, geração, visualização, liberação e assinatura.

## 12. Critérios de aceite

1. Job de folha concluído é normalizado automaticamente sem comando manual.
2. Nenhum job fica `COMPLETED` e sem normalização além do prazo de lease mais um ciclo.
3. Worker travado é reiniciado e retoma o trabalho sem duplicar holerites.
4. Dashboard mostra fase e heartbeat reais do worker.
5. Falha de Push não altera o resultado de jobs ou runs.
6. Interrupção parcial é reparada automaticamente.
7. Duas instâncias não processam o mesmo job simultaneamente.
8. RealEnergy mantém todos os dados, documentos, hashes e credenciais existentes.
9. Isolamento por empresa continua coberto por testes e verificador de produção.
10. Deploy comprova commit, build, PID novo, heartbeat e fila drenada.

## 13. Fora de escopo

- introduzir Redis, RabbitMQ ou outro broker;
- alterar o protocolo do conector Sage além dos campos de status expostos pela API;
- redesenhar telas não relacionadas à fila;
- alterar autenticação, PIN ou seleção de empresa;
- regenerar documentos históricos válidos;
- executar mais de uma réplica permanente do worker nesta entrega, embora o lease torne reloads sobrepostos seguros.
