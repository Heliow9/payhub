# PayHub — Especificação Técnica e Design do Core Platform

**Data:** 16/09/2026  
**Nome oficial:** PayHub  
**Etapa:** 1 — Core Platform

## 1. Objetivo

Construir a base segura e testável do PayHub para administrar usuários internos, autenticação, autorização, auditoria e o dashboard administrativo, deixando contratos estáveis para as próximas etapas de integração com folha, importação de holerites, geração de PDF e assinatura pelo funcionário.

## 2. Arquitetura aprovada

- **API:** Node.js + TypeScript, arquitetura modular.
- **Dashboard:** React + Vite + TypeScript.
- **Banco principal:** MySQL 5.6, schema `pay_hub`.
- **Produção:** Ubuntu 24.04 em AWS Lightsail, processos via PM2 e proxy reverso via Nginx.
- **Deploy:** Git.
- **Etapa 2:** serviço Windows em .NET 8 executado no `SERVIDORSQL`, acessando o banco `Sage_Gestao_Contabil` exclusivamente em modo de leitura.

## 3. Escopo da Etapa 1

### 3.1 Monorepo

O repositório terá workspaces independentes para `apps/api` e `apps/dashboard`, além de documentação, configuração comum e scripts de desenvolvimento.

### 3.2 Usuários administrativos

Perfis iniciais:

- `MASTER`: acesso integral ao Core Platform e gestão de analistas.
- `ANALISTA`: acesso ao dashboard e consultas permitidas, sem administração de Masters.

A criação do primeiro `MASTER` será feita por comando de bootstrap, usando variáveis de ambiente. Depois de existir um Master, a API não terá rota pública para criação de administradores.

### 3.3 Autenticação e sessão

- Login por e-mail e senha.
- Senhas armazenadas com `scrypt`, salt aleatório e comparação em tempo constante.
- Sessão opaca armazenada no MySQL; o navegador recebe somente um identificador aleatório em cookie `HttpOnly`.
- Cookie com `SameSite=Lax`, `Path=/` e `Secure` habilitável por ambiente.
- Sessões possuem expiração e podem ser revogadas no logout.
- A API nunca armazena senha em texto puro nem token de sessão em texto puro.

### 3.4 Proteção CSRF

Cada sessão possui um token CSRF independente. Requisições mutáveis autenticadas (`POST`, `PUT`, `PATCH`, `DELETE`) exigem o header `X-CSRF-Token` correspondente à sessão.

### 3.5 Autorização

A API usará middleware de autenticação e RBAC. Operações administrativas sensíveis, como criação de Analistas, exigem papel `MASTER`.

### 3.6 Auditoria

Eventos relevantes serão persistidos em `audit_logs`, incluindo:

- bootstrap do primeiro Master;
- login realizado;
- tentativa de login inválida;
- logout;
- criação de Analista;
- alterações administrativas relevantes nas etapas seguintes.

O log terá ator, ação, alvo, IP, user-agent, metadados JSON e data/hora.

### 3.7 Dashboard

A interface inicial do PayHub terá:

- tela de login;
- shell autenticado com identidade PayHub;
- visão inicial com estado da sessão e cards de preparação dos módulos futuros;
- área de gestão de usuários visível ao Master;
- logout;
- tratamento de sessão expirada e erros de API.

A Etapa 1 não inclui ainda holerites reais nem assinatura; esses módulos aparecem apenas como próximos componentes da plataforma.

## 4. Banco de dados

### `users`

- `id` BIGINT UNSIGNED PK
- `name` VARCHAR(120)
- `email` VARCHAR(190) UNIQUE
- `password_hash` VARCHAR(255)
- `role` ENUM(`MASTER`, `ANALISTA`)
- `status` ENUM(`ACTIVE`, `DISABLED`)
- `created_at`, `updated_at`

### `sessions`

- `id` BIGINT UNSIGNED PK
- `user_id` FK -> users
- `token_hash` CHAR(64) UNIQUE
- `csrf_token_hash` CHAR(64)
- `expires_at`
- `created_at`, `last_seen_at`, `revoked_at`

### `audit_logs`

- `id` BIGINT UNSIGNED PK
- `actor_user_id` nullable FK -> users
- `action` VARCHAR(100)
- `target_type` VARCHAR(80) nullable
- `target_id` VARCHAR(100) nullable
- `ip_address` VARCHAR(64) nullable
- `user_agent` VARCHAR(500) nullable
- `metadata_json` TEXT nullable
- `created_at`

## 5. Contratos HTTP da Etapa 1

Base: `/api`

- `GET /health` — saúde da API.
- `POST /auth/login` — autentica e cria sessão.
- `GET /auth/me` — retorna usuário autenticado e token CSRF da sessão.
- `POST /auth/logout` — revoga sessão atual.
- `GET /dashboard/summary` — resumo inicial do Core Platform.
- `GET /users` — lista usuários; somente Master.
- `POST /users` — cria Analista; somente Master.

Namespaces reservados para etapas posteriores: `/funcionarios`, `/holerites`, `/importacoes`.

## 6. Fluxo futuro de holerite e assinatura já definido

O holerite não ficará automaticamente disponível para assinatura. O funcionário somente poderá assinar depois que a solicitação for emitida pelo dashboard. Nesse momento o holerite mudará para o status **`Assinatura solicitada`**, liberando o fluxo de assinatura. Essa regra será implementada na etapa dedicada a holerites/assinaturas e deve permanecer como contrato funcional do PayHub.

## 7. Segurança mínima obrigatória

- validação de payload;
- rate limit em login;
- CORS configurável por ambiente;
- headers de segurança;
- cookie HttpOnly;
- tokens opacos de alta entropia;
- hashes SHA-256 dos tokens no banco;
- senha por scrypt;
- mensagens de login sem revelar se o e-mail existe;
- auditoria de ações administrativas;
- nenhuma credencial real versionada no Git.

## 8. Testes da Etapa 1

- unitários para senha, sessão, CSRF e RBAC;
- integração HTTP para login, `me`, logout e proteção Master;
- build TypeScript da API;
- testes de componentes/fluxos essenciais do dashboard;
- build Vite do dashboard.

## 9. Critérios de aceite

A Etapa 1 estará concluída quando:

1. o repositório instalar dependências por um único `npm install`;
2. migrations criarem o schema lógico do Core Platform em MySQL 5.6;
3. o bootstrap criar o primeiro Master sem rota pública de cadastro;
4. login, sessão, CSRF e logout funcionarem;
5. um Master puder criar/listar Analistas e um Analista não puder executar essas ações;
6. auditoria registrar os eventos definidos;
7. dashboard autenticar e consumir a API;
8. `npm test` e `npm run build` passarem no monorepo.

## 10. Fora do escopo desta etapa

- conexão com Sage/SQL Server;
- Windows Service .NET 8;
- importação/normalização de folha;
- geração e armazenamento de PDF;
- cadastro/acesso de funcionários;
- assinatura de holerite;
- PWA/Expo;
- deploy real em Lightsail.

Esses itens permanecem nas etapas seguintes sem alteração das decisões já aprovadas.
