# Validação do hotfix 0.5.3

Escopo: correção do processamento de holerites que podia permanecer em **Em execução** depois da coleta Sage.

Validações executadas neste pacote:

- parse sintático de 214 arquivos TypeScript/TSX: OK;
- sintaxe dos bundles JavaScript críticos (worker, dashboard API, health e bundle web): OK;
- smoke test manual do claim/lease de normalização: OK;
- smoke test manual da retentativa da outbox de Push: OK;
- smoke test manual do watchdog fatal: OK;
- arquivos do worker durável e migration 006 presentes: OK;
- estados de UI `Coletando no Sage`, `Aguardando processamento`, `Gerando holerite` e falhas incluídos no bundle web: OK;
- versão do pacote: 0.5.3.

O ambiente de revisão não teve acesso ao registry npm, portanto a suíte Vitest e o build completo com `npm ci` devem ser executados no servidor/homologação antes do deploy definitivo. O procedimento está em `DEPLOY-DURABLE-WORKER.md`.
