# PayHub Sage Connector 3.2.0

## Otimizações do PAYROLL_IMPORT

- A geração de holerites passa a consultar somente as fontes financeiras necessárias: `ProcEvento`, `MovEvento`, `ProcBase`, `MovCapa` e `EventoGVigencia`.
- `Funcionario`, `FunDocumento`, `FunFuncional` e `FunSalario` continuam disponíveis para cadastro/sincronização de funcionário, mas deixam de ser retransmitidas em toda folha.
- `EventoGVigencia` deixa de ser lida integralmente: o conector coleta primeiro os códigos presentes em `ProcEvento`/`MovEvento` e consulta apenas as definições correspondentes.
- O filtro de empresa, funcionário, competência e tipo continua obrigatório quando a tabela oferece as respectivas colunas.
- A leitura continua `ApplicationIntent=ReadOnly` e com `SequentialAccess`.

## Compatibilidade

Requer PayHub API 0.6.0 para aproveitar o pipeline otimizado, mas o formato dos batches continua compatível com o normalizador anterior.
