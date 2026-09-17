# PayHub Sage Connector 3.1.0

Esta versão corrige a seleção de salário e função atuais usando a maior data de vigência e amplia a leitura cadastral de desligamento/aviso prévio.

## Publicar no Windows
```powershell
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained false -o .\publish
```

Preserve o `appsettings.json` real do servidor e não altere Connector ID/token.
