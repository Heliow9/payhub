# PayHub 0.5.2 — Hotfix de build do perfil do funcionário

## Correção

Corrige o erro TypeScript `TS2339` em `apps/api/src/services/employee.service.ts` durante o build da versão 0.5.1.

A consulta de estatísticas do perfil do funcionário agora utiliza uma linha MySQL explicitamente tipada com:

- `total`
- `signedCount`
- `pendingCount`

Também foi mantido fallback seguro para `0` quando não houver linha retornada.

## Banco de dados

Não existe migration nesta versão.

## Connector Sage

Não precisa atualizar o Connector Sage para este hotfix.

## Deploy

```bash
cd /var/www/payhub
npm install
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
```
