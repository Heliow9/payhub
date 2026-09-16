# PayHub

PayHub é a plataforma para integração, distribuição e assinatura controlada de holerites. Este repositório contém a **Etapa 1 — Core Platform** aprovada.

## O que já existe nesta etapa

- monorepo npm;
- API Node.js + TypeScript modular;
- Dashboard React + Vite;
- MySQL 5.6 (`pay_hub`);
- perfis `MASTER` e `ANALISTA`;
- bootstrap único do primeiro Master;
- login/logout com sessão opaca persistida;
- cookie de sessão HttpOnly;
- CSRF vinculado à sessão;
- rate limit de login;
- auditoria;
- gestão de Analistas pelo Master;
- estrutura PM2 + Nginx para Lightsail.

A integração com `Sage_Gestao_Contabil` **não pertence à Etapa 1**. Ela será feita na Etapa 2 por um **.NET 8 Windows Service no SERVIDORSQL, somente leitura**.

## Regra de negócio preservada para holerites

O funcionário não poderá assinar o holerite automaticamente. A assinatura somente será liberada depois que o dashboard emitir a solicitação. Nesse momento, o holerite terá o status **`Assinatura solicitada`**.

## Estrutura

```text
PayHub/
├─ apps/
│  ├─ api/           # API, migrations, domínio, repositórios e scripts
│  └─ dashboard/     # React/Vite
├─ deploy/nginx/     # exemplo de proxy/reverse proxy
├─ docs/superpowers/ # especificação e plano técnico
├─ ecosystem.config.cjs
└─ .env.example
```

## Pré-requisitos

- Node.js 22+
- npm 10+
- MySQL 5.6+

## 1. Instalação

Na raiz:

```bash
npm install
```

## 2. Configuração

Copie `.env.example` para `.env` e ajuste os valores.

```bash
cp .env.example .env
```

Nunca versione `.env`.

Para produção atrás de HTTPS, use:

```env
NODE_ENV=production
COOKIE_SECURE=true
APP_ORIGIN=https://seu-dominio
```

## 3. Criar/migrar o banco

O usuário MySQL configurado precisa ter permissão para criar o banco na primeira execução. Se o DBA já tiver criado `pay_hub`, basta conceder acesso às tabelas.

```bash
npm run db:migrate
```

A migration `001_core.sql` é compatível com MySQL 5.6 e cria `users`, `sessions` e `audit_logs`.

## 4. Criar o primeiro Master

Preencha no `.env`:

```env
MASTER_NAME=Administrador PayHub
MASTER_EMAIL=admin@suaempresa.com.br
MASTER_PASSWORD=uma-senha-forte-com-12-ou-mais-caracteres
```

Depois:

```bash
npm run bootstrap:master
```

O comando é bloqueado se já existir um `MASTER`.

## 5. Desenvolvimento

API:

```bash
npm run dev --workspace @payhub/api
```

Dashboard:

```bash
npm run dev --workspace @payhub/dashboard
```

O Vite encaminha `/api` para `http://localhost:3000` durante o desenvolvimento.

## 6. Testes e build

```bash
npm test
npm run build
```

## 7. Produção com PM2

Após instalar dependências, migrar o banco e criar o Master:

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

O dashboard gerado fica em `apps/dashboard/dist`. O exemplo `deploy/nginx/payhub.conf.example` serve os arquivos estáticos e encaminha `/api/` para a API na porta 3000.

## Endpoints da Etapa 1

| Método | Endpoint | Acesso |
|---|---|---|
| GET | `/api/health` | Público |
| POST | `/api/auth/login` | Público + rate limit |
| GET | `/api/auth/me` | Autenticado |
| POST | `/api/auth/logout` | Autenticado + CSRF |
| GET | `/api/dashboard/summary` | Autenticado |
| GET | `/api/users` | Master |
| POST | `/api/users` | Master + CSRF |

## Segurança

O token de sessão gerado no login possui 256 bits e somente o hash SHA-256 é persistido. As senhas usam `scrypt` com salt aleatório. O token CSRF também é vinculado à sessão por hash e precisa ser enviado no header `X-CSRF-Token` nas operações autenticadas mutáveis.
