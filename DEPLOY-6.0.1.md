# Deploy PayHub 6.0.1

## 1. Backup

Antes da atualização, salve aplicação, `.env`, banco e storage documental.

```bash
cd /var/www
sudo tar -czf payhub-pre-6.0.1-$(date +%Y%m%d-%H%M%S).tar.gz payhub
```

Faça também backup do banco `pay_hub` pelo mecanismo do provedor.

## 2. Atualize o código

Preserve:

- `/var/www/payhub/.env`;
- diretório configurado em `DOCUMENT_STORAGE_PATH`;
- configurações locais não versionadas.

Confirme:

```bash
cd /var/www/payhub
cat VERSION
```

Esperado:

```text
6.0.1
```

## 3. Dependências e build

```bash
npm ci --no-audit --no-fund
npm run build --workspace @payhub/api
npm run build --workspace @payhub/dashboard

test -f apps/api/dist/server.js
test -f apps/api/dist/worker/main.js
test -f apps/dashboard/dist/index.html
```

Se qualquer build falhar, não reinicie a produção com build parcial.

## 4. Banco

A 6.0.1 não adiciona migration. Mesmo assim, rode o migrador para validar a instalação:

```bash
npm run db:migrate --workspace @payhub/api
```

Em uma base 0.6.1 atualizada, as migrations 001–008 devem aparecer como `skip`.

## 5. Concorrência segura

No `.env`, recomenda-se manter:

```env
PAYROLL_GENERATION_CONCURRENCY=1
```

Somente aumente para 2 ou 3 depois de homologar carga e banco. A aplicação também possui retry para deadlock e lock timeout.

## 6. Reinicie PayHub

```bash
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
sleep 10
pm2 status
```

Confirme `payhub-api` e `payhub-worker` como `online` e confira o worker:

```bash
tail -n 30 ~/.pm2/logs/payhub-worker-out.log
```

## 7. Verificadores obrigatórios

```bash
npm run verify:multi-company --workspace @payhub/api
npm run verify:durable-worker --workspace @payhub/api
npm run verify:document-performance --workspace @payhub/api
npm run verify:group-scheduling --workspace @payhub/api
```

Todos os itens devem retornar `OK`.

## 8. Smoke test UI/UX

### Holerites

1. Abra **Holerites**.
2. Teste pesquisa, filtros e ordenação.
3. Altere o tamanho da página.
4. Selecione todos os itens da página.
5. Clique em **Selecionar todos os resultados** e confirme que a quantidade ultrapassa a página atual.
6. Exporte os selecionados.
7. Com itens `READY`, teste **Liberar selecionados**.
8. Mude de página e confirme que a seleção permanece.

### Funcionários

1. Teste busca por nome/CPF/matrícula.
2. Teste filtros de grupo, PayHub, acesso e Sage.
3. Navegue entre páginas e altere a quantidade por página.

### Notificações e responsividade

1. Abra o sino e clique fora: o painel deve fechar.
2. Abra novamente e pressione `Esc`: deve fechar.
3. Em viewport móvel, abra o menu principal e navegue pelas telas.
4. Abra um modal e pressione `Esc`.

### Geração em lote

Execute uma busca em lote e confirme que não há falha por deadlock. Se o MySQL devolver erro 1213/1205 transitório, o serviço deve tentar novamente automaticamente.

## 9. Connector Sage

Nenhuma atualização adicional é exigida para quem já publicou o Connector Sage 3.2.0.
