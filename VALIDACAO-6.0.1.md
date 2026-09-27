# Validação PayHub 6.0.1

## Validação estática realizada no pacote

- arquivos TypeScript/TSX da API e Dashboard analisados por transpile do TypeScript;
- 185 arquivos verificados;
- 0 erros de sintaxe/transpile;
- JSON dos manifests/versionamento validado;
- versão consolidada em `6.0.1`.

## Itens que devem ser validados no servidor

O ambiente de empacotamento não conseguiu concluir `npm ci` por indisponibilidade/timeout de instalação de dependências. Por isso, o build real deve ser executado no servidor:

```bash
npm ci --no-audit --no-fund
npm run build --workspace @payhub/api
npm run build --workspace @payhub/dashboard
```

Depois execute:

```bash
npm run verify:multi-company --workspace @payhub/api
npm run verify:durable-worker --workspace @payhub/api
npm run verify:document-performance --workspace @payhub/api
npm run verify:group-scheduling --workspace @payhub/api
```

## Casos funcionais obrigatórios

- paginação e filtros de holerites;
- seleção persistente entre páginas;
- seleção de todos os resultados filtrados;
- liberação em lote;
- exportação em lote com divisão em múltiplos ZIPs acima de 200 documentos;
- paginação/filtros de funcionários;
- filtros e paginação das demais telas administrativas;
- central de notificações fechando por clique fora e `Esc`;
- navegação móvel;
- modal fechando por `Esc` sem rolagem do conteúdo ao fundo;
- processamento em lote com `PAYROLL_GENERATION_CONCURRENCY=1`;
- retry de deadlock/lock timeout sem perda do lote.
