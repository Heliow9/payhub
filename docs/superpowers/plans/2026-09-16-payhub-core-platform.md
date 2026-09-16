# PayHub Core Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a Etapa 1 do PayHub com autenticação segura, RBAC Master/Analista, auditoria, MySQL 5.6 e dashboard React/Vite autenticado.

**Architecture:** Monorepo npm workspaces com API Express/TypeScript e dashboard React/Vite. A API usa repositórios com interface para permitir testes em memória e implementação MySQL com `mysql2`; sessões são opacas e persistidas no banco, com CSRF associado à sessão. O dashboard consome a API por cookie HttpOnly e mantém apenas o token CSRF retornado pela sessão.

**Tech Stack:** Node.js 22, TypeScript, Express, Zod, mysql2, React 19, Vite, Vitest, Testing Library, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-16-payhub-core-platform-design.md`

## Global Constraints

- Nome oficial: `PayHub`.
- Banco principal: MySQL 5.6, schema `pay_hub`.
- API: Node.js + TypeScript em arquitetura modular.
- Dashboard: React + Vite + TypeScript.
- Perfis da Etapa 1: `MASTER` e `ANALISTA`.
- Cookie de sessão: HttpOnly; CSRF obrigatório em requisições mutáveis autenticadas.
- Primeiro Master criado somente por bootstrap.
- Nenhuma credencial real versionada.
- Etapa 2 futura: .NET 8 Windows Service no `SERVIDORSQL`, leitura somente de `Sage_Gestao_Contabil`.
- Fluxo futuro preservado: assinatura de holerite só após solicitação pelo dashboard, com status `Assinatura solicitada`.

---

### Task 1: Estrutura do monorepo e contratos comuns da API

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.env.example`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/domain/auth/types.ts`
- Create: `apps/api/src/domain/auth/password.ts`
- Create: `apps/api/src/domain/auth/token.ts`
- Test: `apps/api/src/domain/auth/password.test.ts`
- Test: `apps/api/src/domain/auth/token.test.ts`

**Interfaces:**
- Produces: `hashPassword(password): Promise<string>`, `verifyPassword(password, encoded): Promise<boolean>`, `generateOpaqueToken(): string`, `hashToken(token): string`.

- [ ] Escrever testes de senha e tokens antes da implementação.
- [ ] Executar os testes e confirmar falha por módulos inexistentes.
- [ ] Implementar somente o necessário para os testes passarem.
- [ ] Rodar testes novamente e confirmar sucesso.
- [ ] Commitar a estrutura base e primitives de autenticação.

### Task 2: Banco, migrations e camada de repositórios

**Files:**
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/infra/db/mysql.ts`
- Create: `apps/api/src/infra/db/migrations/001_core.sql`
- Create: `apps/api/src/domain/users/user.repository.ts`
- Create: `apps/api/src/domain/sessions/session.repository.ts`
- Create: `apps/api/src/domain/audit/audit.repository.ts`
- Create: `apps/api/src/infra/repositories/memory/*.ts`
- Create: `apps/api/src/infra/repositories/mysql/*.ts`
- Test: repository contract tests under `apps/api/src/infra/repositories/memory/*.test.ts`

**Interfaces:**
- Produces: `UserRepository`, `SessionRepository`, `AuditRepository`, plus memory and MySQL implementations.

- [ ] Escrever contract tests para criação/busca de usuário, sessão e auditoria.
- [ ] Confirmar falhas iniciais.
- [ ] Implementar interfaces e repositórios em memória.
- [ ] Implementar schema MySQL 5.6 e adapters MySQL.
- [ ] Rodar contract tests e TypeScript.
- [ ] Commitar persistência e migrations.

### Task 3: Serviço de autenticação, sessão, CSRF e RBAC

**Files:**
- Create: `apps/api/src/domain/auth/auth.service.ts`
- Create: `apps/api/src/domain/auth/auth.service.test.ts`
- Create: `apps/api/src/http/middleware/auth.ts`
- Create: `apps/api/src/http/middleware/csrf.ts`
- Create: `apps/api/src/http/middleware/rbac.ts`
- Test: middleware tests under `apps/api/src/http/middleware/*.test.ts`

**Interfaces:**
- Produces: `AuthService.login`, `AuthService.resolveSession`, `AuthService.logout`, `requireAuth`, `requireCsrf`, `requireRole`.

- [ ] Escrever testes de login válido/inválido, sessão expirada/revogada, CSRF e bloqueio de Analista.
- [ ] Confirmar falhas iniciais.
- [ ] Implementar serviços e middlewares mínimos.
- [ ] Rodar testes e refatorar mantendo verde.
- [ ] Commitar autenticação/autorização.

### Task 4: API HTTP, bootstrap Master e auditoria

**Files:**
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/http/routes/auth.routes.ts`
- Create: `apps/api/src/http/routes/users.routes.ts`
- Create: `apps/api/src/http/routes/dashboard.routes.ts`
- Create: `apps/api/src/http/routes/health.routes.ts`
- Create: `apps/api/src/scripts/bootstrap-master.ts`
- Test: `apps/api/src/app.test.ts`

**Interfaces:**
- Produces endpoints `GET /api/health`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/dashboard/summary`, `GET/POST /api/users`.

- [ ] Escrever testes HTTP completos com repositórios em memória.
- [ ] Confirmar falha inicial dos endpoints.
- [ ] Implementar rotas, validação Zod, cookie seguro, rate limit de login e auditoria.
- [ ] Implementar bootstrap do primeiro Master.
- [ ] Rodar testes API e build.
- [ ] Commitar Core API.

### Task 5: Dashboard PayHub

**Files:**
- Create: `apps/dashboard/package.json`
- Create: `apps/dashboard/tsconfig.json`
- Create: `apps/dashboard/vite.config.ts`
- Create: `apps/dashboard/index.html`
- Create: `apps/dashboard/src/main.tsx`
- Create: `apps/dashboard/src/App.tsx`
- Create: `apps/dashboard/src/api/client.ts`
- Create: `apps/dashboard/src/auth/AuthProvider.tsx`
- Create: `apps/dashboard/src/pages/LoginPage.tsx`
- Create: `apps/dashboard/src/pages/DashboardPage.tsx`
- Create: `apps/dashboard/src/pages/UsersPage.tsx`
- Create: `apps/dashboard/src/styles.css`
- Test: component tests under `apps/dashboard/src/**/*.test.tsx`

**Interfaces:**
- Consumes: Core API Task 4.
- Produces: login, sessão, dashboard, gestão de Analistas para Master e logout.

- [ ] Escrever testes de login, renderização autenticada e visibilidade Master.
- [ ] Confirmar falhas iniciais.
- [ ] Implementar client/API provider e páginas.
- [ ] Implementar identidade visual textual PayHub e layout responsivo inicial.
- [ ] Rodar testes e build Vite.
- [ ] Commitar dashboard.

### Task 6: Operação, documentação e verificação final

**Files:**
- Create: `README.md`
- Create: `ecosystem.config.cjs`
- Create: `deploy/nginx/payhub.conf.example`
- Modify: root `package.json`

**Interfaces:**
- Produces: comandos `npm test`, `npm run build`, `npm run dev`, `npm run db:migrate`, `npm run bootstrap:master` e exemplos PM2/Nginx.

- [ ] Documentar configuração local e produção sem credenciais reais.
- [ ] Adicionar scripts operacionais.
- [ ] Rodar todos os testes do monorepo.
- [ ] Rodar todos os builds do monorepo.
- [ ] Verificar ausência de segredos e arquivos gerados no Git.
- [ ] Commitar documentação/operação.
