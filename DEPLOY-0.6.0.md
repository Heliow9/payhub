# PayHub 0.6.0 - Performance + Verificação Documental

## O que muda

A versão 0.6.0 mantém o durable worker da 0.5.3 e incorpora o hotfix PM2 que garante a execução de `main()` via `pm_exec_path`. Além disso:

- número único permanente por versão de holerite (`document_number`);
- página pública `/#/verificar` para conferência documental;
- comparação local do SHA-256 de um PDF recebido (o arquivo não é enviado ao servidor);
- verificação de hash do PDF original/assinado, evidência, HMAC, vínculo evidência/PDF e cadeia de eventos;
- código de verificação impresso no holerite e, depois da assinatura, exibido após as informações de assinatura;
- `render_hash` para evitar recriação desnecessária do PDF;
- normalizador indexado em memória;
- pré-carga em lote de funcionários e holerites atuais;
- persistência de `payroll_items` em lote;
- geração concorrente controlada de até 3 holerites por vez;
- compactação `.json.gz` dos batches Sage após a normalização, com SHA-256 e leitura transparente do arquivo arquivado;
- heartbeat periódico independente durante processamentos longos;
- Sage Connector 3.2.0 com PAYROLL_IMPORT reduzido às fontes financeiras e EventoGVigencia filtrada pelos eventos usados.

## 1. Backup obrigatório

Antes do deploy, faça backup do banco `pay_hub`, do `.env`, do storage documental e da pasta atual `/var/www/payhub`.

Exemplo de backup da aplicação:

```bash
cd /var/www
sudo tar -czf payhub-pre-0.6.0-$(date +%Y%m%d-%H%M%S).tar.gz payhub
```

O backup do MySQL deve ser feito pelo mecanismo disponível no seu provedor.

## 2. Pare somente o worker PayHub

```bash
cd /var/www/payhub
pm2 stop payhub-worker
```

Não execute a migration com um worker 0.5.x processando a fila.

## 3. Atualize os arquivos

Substitua o código pelo pacote 0.6.0, preservando o `.env` e o diretório indicado em `DOCUMENT_STORAGE_PATH`.

Confirme:

```bash
cat VERSION
```

Esperado: `0.6.0`.

## 4. Dependências e build - obrigatório

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

Se qualquer build falhar, não prossiga para o restart.

## 5. Migration 007

```bash
npm run db:migrate --workspace @payhub/api
```

Esperado no primeiro deploy:

```text
applied 007_performance_document_verification.sql
```

A migration:

- cria e preenche `payrolls.document_number`;
- cria e preenche `payrolls.render_hash`;
- cria índices de consulta;
- prepara o arquivamento dos `connector_raw_batches`;
- cria `document_verification_logs`.

Os códigos retroativos são aleatórios/derivados de entropia do banco e não usam o ID do holerite como código público previsível.

## 6. Suba API e worker

```bash
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
sleep 10
pm2 status
```

`payhub-api` e `payhub-worker` devem estar `online`.

Confirme o bootstrap PM2 corrigido:

```bash
tail -n 20 ~/.pm2/logs/payhub-worker-out.log
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
```

Todos os itens devem retornar `OK`.

## 8. Smoke test documental

1. Gere uma nova Busca individual.
2. Confirme que o processamento sai de `Aguardando processamento` e conclui.
3. Abra o holerite e confirme o código `PH-...`.
4. Libere e assine o holerite de teste.
5. Abra o PDF assinado e confirme que, depois das informações de assinatura, aparecem:
   - `Código de verificação`;
   - endereço de conferência.
6. Abra `/#/verificar` sem login e consulte o código.
7. Na tela de verificação, selecione o próprio PDF. O navegador deve calcular o SHA-256 e indicar correspondência com `PDF assinado`.

## 9. Compactar histórico bruto existente (opcional e recomendado)

A partir da 0.6.0, novos jobs normalizados são arquivados automaticamente como `.json.gz` fora do MySQL. Para reduzir o espaço ocupado pelos jobs antigos já concluídos:

```bash
npm run maintenance:archive-raw --workspace @payhub/api -- --limit=100
```

Execute em lotes. O comando só seleciona jobs `PAYROLL_IMPORT` concluídos e normalizados. Cada batch recebe SHA-256 antes de o `LONGTEXT` ser liberado.

Depois confira novamente:

```bash
npm run verify:document-performance --workspace @payhub/api
```

## 10. Sage Connector 3.2.0

O backend 0.6.0 funciona com o conector atual, porém o ganho completo na etapa Sage exige publicar o Connector 3.2.0 no Windows.

No Windows com .NET 8 SDK:

```powershell
cd connector\PayHub.SageConnector
dotnet restore
dotnet publish PayHub.SageConnector.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true -o C:\PayHub\SageConnector
```

Pare o serviço antes de substituir o executável e preserve `appsettings.json`.

## Rollback

Não tente desfazer a migration 007 manualmente depois de documentos 0.6.0 terem sido gerados. Para rollback estrutural, restaure o backup do banco e o backup da aplicação como um par consistente.
