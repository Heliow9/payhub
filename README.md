# PayHub

PayHub é a plataforma para integração, distribuição e assinatura controlada de holerites.

O repositório contém:

- **Etapa 1 — Core Platform**: autenticação, usuários, sessão segura, auditoria e infraestrutura;
- **Etapa 2 — Conector Sage (.NET 8)**: conectores, heartbeat, fila de jobs e Windows Service somente leitura para o `Sage_Gestao_Contabil`.

## Arquitetura atual

```text
SQL Server externo / rede do Sage
┌────────────────────────────────────┐
│ Sage_Gestao_Contabil               │
│ PayHub Sage Connector (.NET 8)     │
│ acesso SQL somente leitura         │
└──────────────────┬─────────────────┘
                   │ HTTPS de saída
                   ▼
AWS Lightsail
┌────────────────────────────────────┐
│ paayhubapi.duckdns.org             │
│ Node.js + TypeScript + PM2         │
│                                    │
│ paayhub.duckdns.org                │
│ React/Vite + Nginx                 │
└──────────────────┬─────────────────┘
                   │ MySQL
                   ▼
pay-hub.mysql.uhserver.com / pay_hub
```

O SQL Server do Sage **não fica no Lightsail e não é exposto na internet**.

## Funcionalidades existentes

### Core

- perfis `MASTER` e `ANALISTA`;
- login/logout com sessão opaca;
- cookie HttpOnly e CSRF;
- `scrypt` para senhas;
- rate limit no login;
- auditoria;
- gestão de Analistas pelo Master.

### Integração Sage

- cadastro de conector pelo Master;
- token opaco de 256 bits, exibido apenas na criação;
- somente hash SHA-256 do token persistido;
- heartbeat do Windows Service;
- fila de jobs;
- progresso e logs;
- snapshots brutos em JSON para a próxima etapa de normalização;
- jobs `CONNECTION_TEST`, `SCHEMA_DISCOVERY` e `PAYROLL_IMPORT`;
- acesso SQL Server somente leitura.

## Regra de negócio preservada para holerites

O funcionário não poderá assinar o holerite automaticamente. A assinatura somente será liberada depois que o dashboard emitir a solicitação. Nesse momento, o holerite terá o status **`Assinatura solicitada`**.

## Estrutura

```text
PayHub/
├─ apps/
│  ├─ api/
│  └─ dashboard/
├─ connector/
│  └─ PayHub.SageConnector/
├─ deploy/nginx/
├─ docs/superpowers/
├─ ecosystem.config.cjs
└─ .env.example
```

## Requisitos do servidor web

- Node.js 22+
- npm 10+
- MySQL 5.6+
- PM2
- Nginx

## Instalação / atualização da API e Dashboard

```bash
npm install
npm test
npm run build
npm run db:migrate
pm2 restart payhub-api --update-env
pm2 save
sudo nginx -t
sudo systemctl reload nginx
```

A migration é idempotente e aplica:

- `001_core.sql` — `users`, `sessions`, `audit_logs`;
- `002_sage_connector.sql` — `connectors`, `import_jobs`, `connector_job_logs`, `connector_raw_batches`.

## Endpoints administrativos

| Método | Endpoint | Acesso |
|---|---|---|
| GET | `/api/health` | Público |
| POST | `/api/auth/login` | Público + rate limit |
| GET | `/api/auth/me` | Autenticado |
| POST | `/api/auth/logout` | Autenticado + CSRF |
| GET | `/api/users` | Master |
| POST | `/api/users` | Master + CSRF |
| GET | `/api/connectors` | Master/Analista |
| POST | `/api/connectors` | Master + CSRF |
| GET | `/api/import-jobs` | Master/Analista |
| POST | `/api/import-jobs` | Master/Analista + CSRF |
| GET | `/api/import-jobs/:id/logs` | Master/Analista |

## Endpoints do Windows Service

Todos exigem `X-PayHub-Connector-Id` e `Authorization: Bearer <token>`.

| Método | Endpoint |
|---|---|
| POST | `/api/connector-agent/heartbeat` |
| POST | `/api/connector-agent/jobs/next` |
| POST | `/api/connector-agent/jobs/:id/progress` |
| POST | `/api/connector-agent/jobs/:id/logs` |
| POST | `/api/connector-agent/jobs/:id/batches` |
| POST | `/api/connector-agent/jobs/:id/complete` |
| POST | `/api/connector-agent/jobs/:id/fail` |

## Windows Service .NET 8

A documentação completa está em `connector/README.md`.

O executável deve ser instalado no servidor Windows que possui acesso ao Sage. A conta SQL deve ter apenas permissão de leitura (`db_datareader` ou privilégios equivalentes restritos às tabelas necessárias).

## Fontes Sage priorizadas

`Funcionario`, `FunDocumento`, `FunFuncional`, `FunSalario`, `ProcEvento`, `EventoGVigencia`, `ProcBase`, `MovCapa`, `MovEvento`.

Tipos já mapeados para a próxima etapa:

- `2`: mensal;
- `3`: adiantamento 13º;
- `4`: 13º;
- `6`: rescisão;
- `2` + evento `180` (`LIQUIDO RESCISAO`): rescisão.

A normalização dos snapshots em funcionários/holerites, geração do PDF e fluxo de assinatura pertencem às próximas etapas.
