# PayHub 6.0.1 — leia antes de atualizar

Esta release é uma evolução de UI/UX da base 0.6.1 e mantém as funcionalidades já entregues: worker durável, agenda durável, logs de lote, verificação documental e Connector Sage 3.2.0.

## Principais mudanças

- paginação e filtros avançados;
- seleção de holerites entre páginas;
- **Selecionar todos os resultados filtrados**;
- liberação e exportação em lote;
- paginação real no backend para holerites e funcionários;
- melhoria da central de notificações;
- menu móvel e melhorias de acessibilidade;
- correção permanente de deadlocks transitórios na geração, com concorrência segura e retry.

## Banco

Não há migration nova nesta versão. O schema continua em 008.

## Connector

Se o Connector Sage 3.2.0 já foi instalado, não é necessário trocá-lo novamente.

## Produção

Leia `DEPLOY-6.0.1.md` e `VALIDACAO-6.0.1.md`. Execute build e verificadores antes de considerar a atualização homologada.
