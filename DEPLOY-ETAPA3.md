# Deploy PayHub Etapa 3

## Lightsail

```bash
cd /opt/payhub
# substitua os arquivos pelo conteúdo desta versão
npm install
npm test
npm run build
npm run db:migrate
mkdir -p /opt/payhub/storage
chmod 700 /opt/payhub/storage
pm2 startOrReload ecosystem.config.cjs
pm2 save
sudo nginx -t
sudo systemctl reload nginx
```

A migration `003_payhub_etapa3.sql` cria as tabelas da Etapa 3 e amplia a fila para `EMPLOYEE_LOOKUP_BY_CPF`.

## Windows / conector Sage

1. Substitua o fonte do conector pela pasta `connector/PayHub.SageConnector`.
2. Publique novamente:

```powershell
cd C:\caminho\PayHub\connector\PayHub.SageConnector
dotnet restore
dotnet publish PayHub.SageConnector.csproj -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true -o C:\PayHub\SageConnector
```

3. Preserve o `appsettings.json` real já validado.
4. Reinicie o serviço `PayHub Sage Connector` ou execute em console para validação.

Nunca envie `appsettings.json` real, token do conector ou senha SQL para o Git.
