# PayHub 6.0.1 — UI/UX, Paginação e Operações em Lote

## Destaques

A 6.0.1 evolui a base 0.6.1 sem remover as migrations 001–008 e sem exigir alteração de schema. O foco é produtividade operacional, navegação e estabilidade em grandes volumes.

### Central de holerites

- paginação real no backend (`page`, `pageSize`) para evitar carregar milhares de holerites no navegador;
- busca textual por funcionário, CPF, grupo, tipo e código documental `PH-...`;
- filtros por grupo, mês, ano, tipo e status;
- ordenação por mais recentes, funcionário, líquido e status;
- seleção persistente entre páginas;
- seleção da página atual;
- ação **Selecionar todos os resultados filtrados**, mesmo quando distribuídos em várias páginas;
- liberação em lote dos holerites selecionados elegíveis;
- exportação em lote dos selecionados, dividida automaticamente em pacotes ZIP de até 200 documentos;
- barra de ações em lote fixa durante a navegação;
- feedback de quantidade selecionada, quantidade apta à liberação e número de pacotes de exportação;
- tabelas com cabeçalho fixo e linhas selecionadas destacadas.

### Funcionários

- paginação real no backend;
- busca por nome, CPF e matrícula Sage;
- filtros por grupo, situação PayHub, acesso e situação Sage;
- indicadores globais de ativos e demitidos;
- tamanho de página configurável.

### Grupos, usuários, auditoria, integração Sage e portal do funcionário

- paginação visual padronizada;
- busca rápida e filtros contextuais;
- limpeza de filtros em um clique;
- indicadores de quantidade de resultados;
- experiência responsiva e consistente entre telas.

### Notificações e navegação

- o sino de notificações agora fecha ao clicar fora;
- `Esc` fecha a central de notificações;
- `Esc` fecha modais;
- bloqueio de rolagem do fundo enquanto um modal está aberto;
- menu de navegação móvel para substituir a sidebar em telas pequenas;
- menu móvel fecha ao clicar fora ou pressionar `Esc`;
- melhorias de foco visível e acessibilidade por teclado.

### Estabilidade da geração de holerites

A 6.0.1 incorpora a correção identificada após o deadlock em processamento em lote:

- `PAYROLL_GENERATION_CONCURRENCY=1` como padrão seguro;
- concorrência configurável entre 1 e 3 quando homologada;
- retry automático de até 3 tentativas para `ER_LOCK_DEADLOCK`/MySQL 1213;
- retry automático para lock timeout/MySQL 1205;
- renovação do lease do worker entre tentativas.

Isso evita que um deadlock transitório derrube toda a geração do lote.

## Compatibilidade

- schema: mantém migrations até `008_durable_group_schedule_run_events.sql`;
- Connector Sage: permanece compatível com **3.2.0**; não é necessária nova troca do conector Windows para esta release;
- pode ser instalada sobre a 0.6.1 já migrada.
