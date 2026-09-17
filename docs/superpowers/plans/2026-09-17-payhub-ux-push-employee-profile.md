# PayHub 0.4.0 UX/Push/Perfil Sage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar PayHub 0.4.0 com branding oficial, UX aprimorada, Web Push, perfil Sage enriquecido, exclusão MASTER segura e PDF sem sobreposição.

**Architecture:** A API ganha um serviço de notificações persistentes/Web Push e uma exclusão transacional de funcionário. O dashboard adiciona componentes de marca, central de notificações e perfil em abas; o PDF mantém o renderer próprio, com métricas de célula corrigidas.

**Tech Stack:** Node.js 22, TypeScript, Express, MySQL 5.6, React/Vite, Service Worker/Web Push, Android WebView.

**Spec:** `docs/superpowers/specs/2026-09-17-payhub-ux-push-employee-profile-design.md`

## Global Constraints
- MySQL 5.6 compatível.
- Exclusão de funcionário somente MASTER.
- Qualquer holerite `SIGNED` bloqueia exclusão.
- Não editar manualmente dados oficiais do Sage.
- Web Push usa VAPID e chaves privadas apenas no backend.
- Modal admin de holerite permanece compacto; PDF mantém duas vias.

---

### Task 1: Branding e assets
**Files:**
- Create: `apps/dashboard/public/assets/*`
- Modify: `apps/dashboard/index.html`, `apps/dashboard/public/manifest.webmanifest`, `apps/dashboard/src/App.tsx`, `apps/dashboard/src/components/AppShell.tsx`, `apps/dashboard/src/pages/LoginPage.tsx`, `apps/dashboard/src/styles.css`
- Modify: Android manifest/styles/resources

- [ ] Criar assets derivados da logo fornecida.
- [ ] Atualizar favicon, manifest, login, loading e shell.
- [ ] Atualizar ícones/splash Android.
- [ ] Executar verificação de arquivos e build frontend.

### Task 2: Perfil Sage enriquecido
**Files:**
- Create: `apps/dashboard/src/components/employee-profile-utils.ts`
- Test: `apps/dashboard/src/components/employee-profile-utils.test.ts`
- Modify: `apps/dashboard/src/pages/EmployeesPage.tsx`, `apps/dashboard/src/styles.css`

- [ ] Escrever teste falhando para aliases e grupos de campos.
- [ ] Implementar helper puro de extração.
- [ ] Renderizar abas e dados reais do snapshot.
- [ ] Verificar testes.

### Task 3: Exclusão MASTER segura
**Files:**
- Test: `apps/api/src/tests/employee-delete-policy.test.ts`
- Modify: `apps/api/src/services/employee.service.ts`, `apps/api/src/routes/employees.routes.ts`, `apps/dashboard/src/api/client.ts`, `apps/dashboard/src/pages/EmployeesPage.tsx`

- [ ] Testar política de bloqueio para SIGNED e permissão MASTER na rota.
- [ ] Implementar método transacional e limpeza de arquivos.
- [ ] Implementar endpoint `DELETE /api/employees/:id` com `requireMaster` + CSRF.
- [ ] Implementar confirmação crítica na UI MASTER.
- [ ] Verificar testes e build.

### Task 4: Notificações persistentes e Web Push
**Files:**
- Create: `apps/api/src/db/migrations/004_notifications.sql`
- Create: `apps/api/src/services/notification.service.ts`
- Create: `apps/api/src/routes/notifications.routes.ts`
- Test: `apps/api/src/tests/notification-policy.test.ts`
- Modify: `apps/api/src/config/env.ts`, `apps/api/src/app.ts`, `apps/api/package.json`, `.env.example`
- Modify: serviços de payroll/signature/worker para eventos

- [ ] Escrever testes falhando para preferências, audience e payload.
- [ ] Criar schema e serviço.
- [ ] Integrar envio Web Push e persistência.
- [ ] Integrar eventos de negócio.
- [ ] Verificar testes.

### Task 5: Central de notificações e Service Worker
**Files:**
- Create: `apps/dashboard/src/components/NotificationCenter.tsx`
- Create: `apps/dashboard/src/push.ts`
- Modify: `apps/dashboard/src/api/client.ts`, `apps/dashboard/src/components/AppShell.tsx`, `apps/dashboard/src/pages/EmployeePortalPage.tsx`, `apps/dashboard/public/sw.js`, `apps/dashboard/src/styles.css`

- [ ] Implementar registro/subscribe Web Push opt-in.
- [ ] Implementar sino, lista, marcação de lida e preferências básicas.
- [ ] Implementar handlers push/notificationclick no SW.
- [ ] Verificar build frontend.

### Task 6: Central de holerites UI/UX
**Files:**
- Modify: `apps/dashboard/src/pages/PayrollsPage.tsx`, `apps/dashboard/src/styles.css`
- Test: `apps/dashboard/src/components/payroll-document-utils.test.ts`

- [ ] Manter modal compacto e natureza em português.
- [ ] Melhorar botões de ação com ícones e estados.
- [ ] Confirmar ordenação Sage por natureza + código.
- [ ] Verificar testes/build.

### Task 7: PDF sem sobreposição
**Files:**
- Test: `apps/api/src/tests/pdf.test.ts`
- Modify: `apps/api/src/services/pdf.service.ts`

- [ ] Criar teste estrutural para coordenadas/linhas críticas do PDF.
- [ ] Ajustar alturas/paddings do cabeçalho e bases.
- [ ] Renderizar PDF de amostra e inspecionar visualmente.
- [ ] Verificar testes.

### Task 8: Release 0.4.0
**Files:**
- Modify: `VERSION`, package versions, `README.md`
- Create: `DEPLOY-HOTFIX-0.4.0.md`

- [ ] Atualizar versão.
- [ ] Rodar suite completa de testes e builds.
- [ ] Verificar ZIP e checksums.
- [ ] Gerar pacote final pronto para overlay/GitHub/Lightsail.
