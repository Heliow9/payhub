# PayHub 0.4.1 — atualização de produção

## Alterações
- salário/função atuais selecionados pela vigência mais recente no Sage;
- histórico salarial e funcional no perfil;
- situação Sage e dados de desligamento/aviso quando disponíveis;
- telefone/WhatsApp brasileiro no cadastro;
- botão Sincronizar Sage;
- PWA do funcionário com visualização discriminativa do holerite;
- assinatura desenhada visível em Assinatura/Evidências no administrativo;
- PDF assinado com texto de aceite completo, sem truncamento;
- inclui o hotfix TypeScript do Web Push.

## Servidor Linux
```bash
cd /var/www/payhub
git pull --ff-only origin main
npm install
npm run db:migrate
npm test
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 status
```

Não há migration nova além da `004_notifications.sql` já introduzida na 0.4.0. Se ela já foi aplicada, o migrador apenas a reconhecerá.

## Connector Sage 3.1.0
O connector precisa ser atualizado porque a seleção de salário/função vigentes acontece no Windows, junto ao SQL Server Sage.

No Windows, dentro de `connector/PayHub.SageConnector`:
```powershell
dotnet restore
dotnet publish -c Release -r win-x64 --self-contained false -o .\publish
```

Pare o serviço antigo, preserve o `appsettings.json` real, substitua os binários pelo conteúdo de `publish` e inicie o serviço novamente. Não troque Connector ID/token.
