# PayHub — Runbook de implantação Multiempresa

Este roteiro conclui a migração do PayHub de uma única empresa para isolamento por `company_id`, preservando a RealEnergy como empresa original e as evidências/documentos já existentes.

> **Regra de segurança:** execute primeiro em uma cópia/homologação do banco real. A migration `005_multi_company.sql` adiciona e preenche estruturas; não remova as novas colunas durante rollback de código.

## 1. Pré-requisitos

- Node.js 22+ e dependências instaladas (`npm ci` ou `npm install`).
- `.env` apontando explicitamente para o banco que será tratado.
- Acesso de leitura/escrita ao MySQL externo.
- Espaço para backup do banco e dos documentos em `DOCUMENT_STORAGE_PATH`.
- PM2 disponível no servidor da API/worker.

Confirme o alvo antes de qualquer migration:

```bash
grep -E '^(DB_HOST|DB_PORT|DB_NAME|DB_USER|DOCUMENT_STORAGE_PATH)=' .env
```

Nunca publique `DB_PASSWORD`, `SIGNATURE_SEAL_SECRET`, chaves VAPID ou tokens TSA em logs/tickets.

## 2. Criar baseline antes da migration

### 2.1 Backup do banco

```bash
mysqldump --single-transaction --routines --triggers \
  -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p \
  "$DB_NAME" > "payhub-before-multiempresa-$(date +%Y%m%d-%H%M%S).sql"
```

Se as variáveis não estiverem exportadas no shell, substitua apenas host/porta/usuário/nome do banco pelos valores da `.env`; a senha deve continuar sendo solicitada pelo cliente MySQL.

### 2.2 Backup dos documentos

```bash
tar -czf "payhub-documents-before-multiempresa-$(date +%Y%m%d-%H%M%S).tar.gz" \
  "$DOCUMENT_STORAGE_PATH"
```

### 2.3 Inventário de hashes existentes

Antes da migration, gere uma lista de referência dos PDFs para conferência posterior:

```bash
find "$DOCUMENT_STORAGE_PATH" -type f -name '*.pdf' -print0 \
  | sort -z \
  | xargs -0 sha256sum > payhub-pdf-hashes-before-multiempresa.sha256
```

## 3. Ensaio obrigatório em homologação

Restaure o dump em uma base clonada e configure uma `.env` exclusiva para ela. Em seguida:

```bash
npm run db:migrate
npm run verify:multi-company --workspace @payhub/api
npm test
npm run build
```

O verificador deve terminar sem `FAIL`. Em especial, confirme:

- uma única empresa `realenergy`;
- nenhum usuário/funcionário sem `company_id`;
- nenhuma divergência de empresa entre sessão, funcionário, connector, job e holerite;
- identidades de funcionário preservadas;
- documentos assinados mantendo seus hashes.
- exatamente um usuário `MASTER/ACTIVE` por empresa ativa, correspondente ao registro de `company_masters`.

## 4. Smoke test de duas empresas em homologação

Use o serviço de provisionamento da aplicação para criar uma empresa de teste e valide, sem inserir `company_id` manualmente pela interface:

1. MASTER da RealEnergy visualiza somente RealEnergy.
2. MASTER da empresa de homologação visualiza somente a própria empresa.
3. Um CPF vinculado às duas empresas recebe a tela **Escolha a empresa** após CPF + PIN.
4. Vínculo `TERMINATED` da RealEnergy abre apenas histórico e não permite nova assinatura.
5. Vínculo `ACTIVE` da empresa de homologação permite o fluxo completo.
6. Troca de empresa gera nova sessão e o contexto anterior deixa de ser utilizado.
7. Connector RealEnergy não reivindica job da empresa de homologação.
8. Dashboard, notificações, auditoria e worker retornam/processam somente a empresa corrente.
9. Consulta direta de um ID pertencente à outra empresa responde como recurso inexistente/sem acesso.

## 5. Implantação em produção

Entre em janela de manutenção para evitar criação de novos jobs/assinaturas durante a alteração estrutural.

### 5.1 Atualizar código e dependências

```bash
npm ci
```

### 5.2 Aplicar migration e validar invariantes

```bash
npm run db:migrate
npm run verify:multi-company --workspace @payhub/api
```

**Não prossiga** se qualquer check retornar `FAIL`.

O executor usa lock exclusivo e registra cada tentativa em `schema_migration_runs`. Como o MySQL confirma operações DDL como `ALTER TABLE` implicitamente, uma execução interrompida fica marcada como `RUNNING` ou `FAILED` e uma repetição automática é bloqueada. Nesse caso, **não apague o registro para tentar novamente às cegas**: interrompa a implantação, inspecione o ponto de falha e restaure o clone/backup anterior ou conclua uma recuperação manual validada antes de liberar uma nova execução.

### 5.3 Executar regressão e build

```bash
npm test
npm run build
```

### 5.4 Reiniciar processos

```bash
pm2 startOrReload ecosystem.config.cjs
pm2 save
pm2 status
```

Acompanhe API e worker logo após o restart:

```bash
pm2 logs --lines 150
```

## 6. Validação pós-deploy

Execute novamente:

```bash
npm run verify:multi-company --workspace @payhub/api
```

Confira os hashes físicos dos PDFs:

```bash
sha256sum -c payhub-pdf-hashes-before-multiempresa.sha256
```

Os arquivos existentes antes da migration devem retornar `OK`. A migration de multiempresa não deve reescrever PDFs assinados.

Também valide manualmente:

- login do MASTER original da RealEnergy;
- dashboard da RealEnergy;
- connector online e importação Sage da RealEnergy;
- login de funcionário com um único vínculo;
- login de funcionário com múltiplos vínculos;
- troca de empresa no navegador/PWA;
- troca de empresa no Android/Expo;
- download de holerite no contexto selecionado;
- assinatura, evidências, auditoria e notificações no contexto correto.

## 7. Sessões existentes

A migration associa as sessões antigas à empresa correspondente. Mesmo assim, para uma implantação de maior rigor operacional, pode-se optar por encerrar sessões ativas antes da liberação e exigir novo login. Faça isso somente com procedimento administrativo controlado; não apague identidades, PINs ou credenciais dos funcionários.

## 8. Rollback

Se a aplicação nova apresentar erro após a migration:

1. interrompa API/worker novos;
2. restaure a versão anterior do código;
3. mantenha as novas tabelas/colunas da migration no banco — elas são aditivas e removê-las aumenta o risco de perda;
4. restaure o dump **somente** se houver evidência de corrupção/alteração indevida de dados e se a janela de manutenção garantir que não serão perdidos registros legítimos criados depois do backup;
5. restaure documentos apenas se a conferência SHA-256 indicar alteração física indevida.

Para rollback completo do banco, use o dump e o backup dos documentos produzidos no início da janela. Registre a decisão e preserve os arquivos de evidência para auditoria.

## 9. Ordem resumida aprovada

```bash
mysqldump --single-transaction --routines --triggers <database> > payhub-before-multiempresa.sql
npm run db:migrate
npm run verify:multi-company --workspace @payhub/api
npm test
npm run build
pm2 startOrReload ecosystem.config.cjs
pm2 save
```

A liberação só deve ocorrer quando os testes automatizados, o verificador do banco clonado e o smoke test de duas empresas estiverem aprovados.
