# PayHub Sage Connector — Etapa 3

É o **mesmo conector .NET 8 da Etapa 2**, evoluído. Não existe um segundo conector.

Funções:
- heartbeat e fila HTTPS;
- `CONNECTION_TEST`;
- `SCHEMA_DISCOVERY`;
- `EMPLOYEE_LOOKUP_BY_CPF` (empresa 1);
- `PAYROLL_IMPORT` restrito aos códigos Sage de funcionários cadastrados no PayHub;
- SQL Server somente leitura.

## Publicar

No Windows com .NET 8 SDK:

```powershell
cd connector\PayHub.SageConnector
dotnet restore
dotnet publish PayHub.SageConnector.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true -o C:\PayHub\SageConnector
```

Copie `appsettings.example.json` para `C:\PayHub\SageConnector\appsettings.json`, preencha o token e a senha SQL localmente e teste em console:

```powershell
cd C:\PayHub\SageConnector
.\PayHub.SageConnector.exe
```

Depois instale o serviço pelo PowerShell como Administrador:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
C:\PayHub\SageConnector\install-service.ps1
sc.exe query "PayHub Sage Connector"
```

**Não envie `appsettings.json` com credenciais ao Git.**
