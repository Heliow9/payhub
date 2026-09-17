# PayHub 0.4.6 — Hotfix de build TypeScript

## Correção

Corrige o erro `TS18048: marker is possibly undefined` em `apps/api/src/services/pdf.service.ts` durante `npm run build`.

A validação do byte marcador JPEG agora verifica explicitamente `marker === undefined` antes das comparações numéricas.

## Deploy

```bash
npm install
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

Não há migration de banco.
