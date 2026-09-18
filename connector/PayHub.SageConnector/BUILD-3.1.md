# PayHub Sage Connector 3.1.4

Esta versão mantém as melhorias do 3.1.0 e adiciona dois hotfixes confirmados em produção:

- valores monetários do Sage com vírgula decimal (ex.: `2783,42`) são interpretados como `2783.42`, sem multiplicação por 100;
- `EventoGVigencia` é tratado como tabela global de referência e não recebe filtros de competência/tipo da folha. Isso preserva descrição e natureza dos eventos.

## Publicar no Windows
```powershell
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained false -o .\publish
```

O executável ficará em `publish\PayHub.SageConnector.exe`. Copie **todo o conteúdo** da pasta `publish`.

Preserve o `appsettings.json` real do servidor e não altere Connector ID/token.


## 3.1.4 — Função e CBO pela estrutura real do Sage

Para consulta de funcionário, a função atual deixa de ser inferida genericamente a partir de `FunFuncional`.

A origem canônica passa a ser:

```text
FunFuncao.cd_empresa      -> Funcao.enterprise_id
FunFuncao.cd_funcao       -> Funcao.cd_funcao
Funcao.descricao_completa -> função/cargo
Funcao.descricao          -> fallback da função/cargo
Funcao.cbo2002            -> CBO principal
Funcao.cbo                -> fallback do CBO
```

O registro vigente é priorizado por `FunFuncao.dt_final`, e depois pela `dt_funcao` mais recente.
