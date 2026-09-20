# PayHub — Relatório de conclusão Superpowers / Multiempresa

Data da execução: 2026-09-19
Plano: `docs/superpowers/plans/2026-09-19-payhub-multiempresa.md`
Ledger: `.superpowers/sdd/2026-09-19-payhub-multiempresa/progress.md`

## Escopo concluído nesta continuação

O pacote recebido já continha as Tasks 1–7 concluídas e a Task 8 iniciada. Esta execução continuou exatamente do ponto de interrupção e implementou o restante das Tasks 8–11.

### Task 8 — Auditoria, notificações, dashboard e worker

- Corrigidos call-sites de `notifyAdmins(companyId, ...)` e `notifyEmployee(companyId, ...)`.
- Dashboard administrativo isolado por `company_id` em funcionários, grupos, holerites, jobs, connectors e runs.
- Worker passou a carregar/preservar empresa na normalização, agenda e alertas.
- Falha de uma empresa/job/agenda não interrompe processamento de outra.
- Worker pode ser importado em teste sem iniciar loop em background.
- Criado `worker-tenancy.test.ts`.
- Join de auditoria reforçado para manter ator na mesma empresa do log.

### Task 9 — Web/PWA

- `AuthOutcome` suporta sessão definitiva ou escolha de empresa.
- Nenhum CSRF/principal é persistido antes da seleção definitiva.
- Endpoint autenticado `GET /api/auth/companies` lista vínculos do funcionário atual.
- Implementados `selectCompany` e `switchCompany`.
- Seleção temporária é descartada ao cancelar ou ao expirar/retornar 401.
- Criado `CompanySelector` com indicação de vínculo ativo/histórico.
- Portal do funcionário mostra empresa atual e permite troca quando houver mais de um vínculo.
- Troca força remontagem do portal para não reaproveitar estado/caches do tenant anterior.
- `AppShell` administrativo mostra o nome da empresa da sessão.
- Removidas referências operacionais fixas a “Empresa 1” em Funcionários/Grupos.
- Testes Web atualizados/criados para seleção multiempresa.

### Task 10 — Android/Expo

- Login e primeiro acesso aceitam resposta intermediária sem `accessToken`.
- SecureStore só recebe token/CSRF após sessão definitiva.
- Criados estado puro de seleção e componente `CompanySelector` mobile.
- Login exibe seleção antes de navegar para o portal.
- Layout do funcionário mostra empresa/vínculo atual e ação de troca.
- Troca de empresa usa nova sessão; o token anterior é revogado no servidor e removido do dispositivo antes de persistir o novo.
- Navigator é remontado após troca para descartar estado do contexto anterior.
- Vínculo encerrado é identificado como acesso a documentos anteriores.

### Task 11 — Regressão e implantação

- `apps/api/src/app.test.ts` legado substituído por testes da pilha HTTP atual.
- Cobertura adicionada para login MASTER RealEnergy, acesso cross-company por ID e escolha após CPF com dois vínculos.
- Teste da migration ampliado.
- Verificador multiempresa reforçado com inconsistências de grupo/run/agendamento/connector/auditoria/configuração.
- Corrigidos fontes legados ainda compilados que usavam `MYSQL_*` em vez de `DB_*`.
- README atualizado para arquitetura multiempresa.
- Criado `DEPLOY-MULTIEMPRESA.md` com backup, hashes, homologação, migration, verificador, testes, build, PM2, smoke test e rollback.

## Validações executadas neste ambiente

- Verificação sintática via TypeScript `transpileModule` em todos os arquivos TS/TSX alterados: **sem erro sintático**.
- `apps/mobile/src/auth/company-selection.ts` compilado isoladamente com `tsc`: **PASS**.
- Auditoria `rg` do plano para empresa fixa: **nenhuma regra operacional fixa encontrada**; ocorrências históricas permanecem apenas em migrations/testes legados quando aplicável.
- Revisão das queries administrativas: recursos de tenant possuem `company_id` direto ou são alcançados por pai previamente validado; consultas globais remanescentes são intencionais para autenticação global, worker multi-tenant ou provisionamento.
- `git diff --no-index --check` não emitiu diagnóstico de whitespace nos arquivos alterados.

## Validações que NÃO foram falsamente marcadas como aprovadas

O ZIP recebido não contém `node_modules`. A tentativa de restaurar dependências com npm ficou bloqueada sem retorno de rede neste ambiente e foi encerrada.

Por isso:

- `npm test` foi executado e terminou com `vitest: not found` (exit 127).
- `npm run build` foi executado e parou antes do typecheck por ausência de `@types/node`, `vite/client` e `vitest/globals`.
- O verificador de migration não foi apontado para produção. Ele precisa rodar em clone/homologação do MySQL, conforme o runbook.

Esses resultados indicam **dependências ausentes no artefato**, não um teste funcional reprovado do código novo. A liberação para produção continua condicionada ao gate abaixo.

## Gate obrigatório antes de produção

No servidor/clone com acesso ao registry npm e ao banco de homologação:

```bash
npm ci
npm run db:migrate
npm run verify:multi-company --workspace @payhub/api
npm test
npm run build
```

Depois execute os smoke tests de duas empresas descritos em `DEPLOY-MULTIEMPRESA.md`. Só então faça `pm2 startOrReload ecosystem.config.cjs` no ambiente produtivo.

## Observação sobre artefatos compilados

O pacote original continha `apps/api/dist` antigo. A entrega final deve ser tratada como **fonte** e o `dist` deve ser recriado por `npm run build`; por segurança, o ZIP final desta execução não reutiliza compilados antigos.
