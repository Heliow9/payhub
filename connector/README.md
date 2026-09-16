# PayHub Sage Connector (.NET 8)

Windows Service da Etapa 2. Deve ser instalado **no servidor Windows que possui acesso ao SQL Server do Sage**, nunca no Lightsail.

## 1. Criar o conector no Dashboard

No PayHub, abra **Integração Sage** e, com um usuário `MASTER`, clique em **Criar conector**. O dashboard mostrará:

- `ConnectorId`;
- token secreto de uso único.

Copie o token imediatamente. O PayHub persiste somente o hash SHA-256.

## 2. Conta SQL somente leitura

Use uma conta SQL dedicada que possua somente `SELECT` no banco `Sage_Gestao_Contabil`.

Exemplo conceitual a ser executado por quem administra o SQL Server:

```sql
USE Sage_Gestao_Contabil;
CREATE USER payhub_reader FOR LOGIN payhub_reader;
ALTER ROLE db_datareader ADD MEMBER payhub_reader;
```

Não conceda `db_datawriter`, `db_owner`, `ALTER`, `INSERT`, `UPDATE` ou `DELETE`.

## 3. Configurar

Copie `appsettings.example.json` para `appsettings.json` e informe:

- `PayHub:ConnectorId`;
- `PayHub:ConnectorToken`;
- `Sage:ConnectionString`.

O conector não envia a connection string do Sage ao PayHub.

## 4. Publicar no Windows

Em uma máquina com .NET SDK 8:

```powershell
dotnet restore .\PayHub.SageConnector.csproj
dotnet publish .\PayHub.SageConnector.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true -o C:\PayHub\SageConnector
```

Copie `appsettings.json` para `C:\PayHub\SageConnector\appsettings.json`.

## 5. Testar em modo console

Antes de instalar o serviço:

```powershell
cd C:\PayHub\SageConnector
.\PayHub.SageConnector.exe
```

No Dashboard, o conector deve passar de `PENDING` para `ONLINE` após o heartbeat.

## 6. Instalar como Windows Service

Copie também `install-service.ps1` para `C:\PayHub\SageConnector`. Abra PowerShell como Administrador:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
C:\PayHub\SageConnector\install-service.ps1
```

O script restringe a leitura do `appsettings.json`, configura início automático e três tentativas de reinício em caso de falha.

Para verificar:

```powershell
sc.exe query "PayHub Sage Connector"
```

## Jobs disponíveis

- **Teste de conexão:** valida SQL Server e banco atual.
- **Descoberta do schema:** lê metadados e contagem das tabelas permitidas.
- **Importação bruta da folha:** envia snapshots em lotes para a API. A normalização em holerites é responsabilidade da Etapa 3.

## Tabelas permitidas

O executável usa uma whitelist fixa:

`Funcionario`, `FunDocumento`, `FunFuncional`, `FunSalario`, `ProcEvento`, `EventoGVigencia`, `ProcBase`, `MovCapa`, `MovEvento`.

Os filtros são parametrizados e só são adicionados se a coluna existir no schema. Isso permite trabalhar com variações do legado sem gerar SQL dinâmico a partir de entrada externa.
